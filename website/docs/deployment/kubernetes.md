# Kubernetes

`templates/saas-starter/` is the only official template that ships a Kubernetes manifest: a single file, `k8s/deployment.yaml`, containing one `Deployment` and one `Service`. `basic-starter` and `cms-starter` don't include any Kubernetes manifests today. This page documents exactly what's in that file — not a generic Kubernetes tutorial.

## The Manifest

Here is `templates/saas-starter/k8s/deployment.yaml` in full:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: saas-app
  labels:
    app: saas-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: saas-app
  template:
    metadata:
      labels:
        app: saas-app
    spec:
      containers:
        - name: app
          image: saas-app:latest
          ports:
            - containerPort: 3000
              name: http
          env:
            - name: NODE_ENV
              value: production
            - name: PORT
              value: "3000"
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: jwt-secret
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: database-url
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: saas-app
spec:
  selector:
    app: saas-app
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  type: LoadBalancer
```

That's the entire file — no `Ingress`, no `HorizontalPodAutoscaler`, no `ConfigMap`, no `PodDisruptionBudget`. See [What's Not Included](#what-s-not-included) below for what you'll need to add yourself for a real production rollout.

## Deployment Breakdown

- **`replicas: 3`** — three pods behind the `saas-app` Service from the start. There's no `HorizontalPodAutoscaler` in this file, so this is a fixed count until you add one.
- **`image: saas-app:latest`** is a placeholder. Before applying this manifest, replace it with the real image you pushed (see [Docker](./docker)), e.g. `your-registry.example.com/nyala-saas:1.0.0`. Using a floating `:latest` tag in production is also worth avoiding — pin a specific version so rollouts are reproducible.
- **`containerPort: 3000`**, named `http`, matches the `EXPOSE 3000` / `PORT` default from the Dockerfile and framework config (see [Environment Variables](./environment)).
- **Environment variables** — only four are set on the container, and only two are static:
  - `NODE_ENV=production` (plain value)
  - `PORT="3000"` (plain value)
  - `JWT_SECRET` — pulled from a Kubernetes `Secret` named `app-secrets`, key `jwt-secret`
  - `DATABASE_URL` — pulled from the same `Secret`, key `database-url`

  Everything else your app might read from `config/*.ts` namespaces (CORS origin, rate limits, mail, storage, session, etc. — see [Environment Variables](./environment)) is **not** set here, so those namespaces will fall back to their hardcoded defaults inside the pod unless you extend this manifest.

### The `app-secrets` Secret

The manifest references a Secret that it does not create. You must create it yourself before the Deployment's pods can start successfully:

```bash
kubectl create secret generic app-secrets \
  --from-literal=jwt-secret="$(openssl rand -base64 32)" \
  --from-literal=database-url="postgresql://user:password@your-db-host:5432/saas_db"
```

If the `app-secrets` Secret (or either key) doesn't exist when the Deployment is applied, the pods will fail to start with a `CreateContainerConfigError`.

## Probes

Both probes target the app's own HTTP server on the same `containerPort: 3000`:

| Probe | Path | Initial Delay | Period | Timeout | Failure Threshold |
|-------|------|---------------|--------|---------|---------------------|
| `livenessProbe` | `/health/live` | 30s | 10s | 5s | 3 |
| `readinessProbe` | `/health/ready` | 10s | 5s | 3s | 3 |

These correspond to `HealthCheckService.checkLiveness()` and `HealthCheckService.checkReadiness()` from `@nyalajs/observability` — see [Monitoring](./monitoring) for exactly what those methods do.

::: warning Probe paths vs. actual routes
`saas-starter`'s `HealthController` (`app/controllers/health.controller.ts`) is decorated with both `@Controller("/health")` **and** `@Version("1")`. The framework's route resolver (`packages/core/src/routing/route-resolver.ts`) prepends a `/v{version}` segment ahead of the controller prefix, so the routes it actually registers are **`GET /v1/health/live`** and **`GET /v1/health/ready`** — not the unversioned `/health/live` / `/health/ready` that this manifest's probes are configured to hit.

As shipped, that means these liveness/readiness probes will 404 against a `saas-starter` deployment. Before relying on this manifest, either:
- update the probe paths to `/v1/health/live` and `/v1/health/ready`, or
- remove the `@Version("1")` decorator from `HealthController` so its routes are unversioned.

This is a real discrepancy in the current template, not a hypothetical — verify it against your own checked-out `health.controller.ts` and `route-resolver.ts` before deploying.
:::

Also note: `HealthCheckService.checkReadiness()` only reports `"down"` if a registered `HealthIndicator` reports it. No starter currently calls `registerIndicator()` for anything (e.g. a database ping), so out of the box `checkReadiness()` always returns `{ status: "up", checks: {} }` regardless of whether the database is actually reachable. If you want the readiness probe to mean anything for database connectivity, you need to register an indicator yourself — see [Monitoring](./monitoring#health-checks).

## Resources

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

Every pod requests a quarter of a CPU core and 256Mi of memory, and is capped at half a core and 512Mi. These are template defaults sized for a small Node.js API process, not a measured production profile for your app — load-test your actual workload and adjust before relying on them at scale. With `replicas: 3`, the Deployment as written requests at minimum 768Mi memory / 750m CPU in aggregate, up to 1536Mi / 1500m under load.

## The Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: saas-app
spec:
  selector:
    app: saas-app
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  type: LoadBalancer
```

- Selects pods labeled `app: saas-app` (matching the Deployment's pod template labels).
- Exposes port `80` externally, forwarding to `targetPort: 3000` on the pod — so the container's own port never needs to be 80.
- `type: LoadBalancer` — on a cloud provider (EKS, GKE, AKS, etc.) this provisions an external load balancer automatically. On a cluster without a cloud LoadBalancer controller (e.g. plain kubeadm or a local cluster), this will stay in `Pending` state. In that case, use `kubectl port-forward` for local testing or switch `type` to `NodePort` / put an `Ingress` in front (see below).

## Deploying

```bash
# Create the secret first (see above) — the Deployment will crash-loop without it
kubectl create secret generic app-secrets \
  --from-literal=jwt-secret="$(openssl rand -base64 32)" \
  --from-literal=database-url="postgresql://user:password@your-db-host:5432/saas_db"

# Apply the Deployment + Service
kubectl apply -f k8s/deployment.yaml

# Watch rollout status
kubectl rollout status deployment/saas-app

# Check pods
kubectl get pods -l app=saas-app

# Check the external endpoint (if LoadBalancer provisioned one)
kubectl get svc saas-app
```

Tail logs from a pod while you verify it's healthy:

```bash
kubectl logs -l app=saas-app -f
```

Describe a pod if it isn't becoming ready — this is the fastest way to see whether it's failing image pull, secret resolution, or the (potentially mismatched, see above) probe:

```bash
kubectl describe pod -l app=saas-app
```

## Updating a Running Deployment

Once `saas-app` is running, roll out a new image by editing `deployment.yaml`'s `image:` field and re-applying, or by using `kubectl set image` directly for a quick update:

```bash
kubectl set image deployment/saas-app app=your-registry.example.com/nyala-saas:1.1.0
```

Because no rollout strategy is specified in the manifest, Kubernetes uses the default `RollingUpdate` strategy for `Deployment` resources (25% max unavailable / 25% max surge), so pods are replaced gradually rather than all at once. Watch it happen with:

```bash
kubectl rollout status deployment/saas-app
```

If the readiness probe never passes on the new pods — which, per the [probe path mismatch](#probes) above, is the current out-of-the-box behavior for an unmodified template — the rollout will stall with old pods still serving traffic (a safety property of `RollingUpdate`, but one that will mask the fact that new pods are actually failing their readiness check).

Roll back to the previous revision if something's wrong:

```bash
kubectl rollout undo deployment/saas-app
kubectl rollout history deployment/saas-app
```

## Scaling Manually

Since there's no `HorizontalPodAutoscaler` in this manifest, changing replica count is a manual operation:

```bash
kubectl scale deployment/saas-app --replicas=5
```

This is a one-off change — it does not edit `k8s/deployment.yaml`, so the next `kubectl apply -f k8s/deployment.yaml` will reset it back to the `replicas: 3` in the file. If you want the new count to persist across re-applies, edit the file itself.

## Troubleshooting

Commands worth knowing when a rollout isn't behaving:

```bash
# Is the pod running at all, or stuck in a bad state?
kubectl get pods -l app=saas-app -o wide

# Why is a specific pod not ready? (events at the bottom are usually the answer —
# ImagePullBackOff, CreateContainerConfigError from a missing Secret key,
# or a failing probe are the most common causes with this manifest)
kubectl describe pod <pod-name>

# What did the app itself log before/after the probe started failing?
kubectl logs <pod-name>

# Is the Service actually routing to ready pods?
kubectl get endpoints saas-app

# Confirm the container really is listening on 3000 inside the pod
kubectl exec -it <pod-name> -- node -e "require('http').get('http://localhost:3000/v1/health/live', r => console.log(r.statusCode))"
```

`CreateContainerConfigError` almost always means the `app-secrets` Secret (or one of its two keys, `jwt-secret`/`database-url`) doesn't exist in the namespace — see [The `app-secrets` Secret](#the-app-secrets-secret) above. A pod stuck `Running` but never `Ready` almost always means the readiness probe is failing — check the probe path mismatch first.

## What's Not Included

Being precise about what actually ships in `templates/saas-starter/k8s/`: it's this one `deployment.yaml`, nothing else. Things you'd typically want for a real production rollout that are **not** in this repo and that you'd need to author yourself:

- **Ingress** — no `Ingress` resource or TLS termination is defined. The `Service` is a bare `LoadBalancer`.
- **HorizontalPodAutoscaler** — `replicas: 3` is fixed; there's no autoscaling based on CPU/memory/custom metrics.
- **ConfigMap** — non-secret configuration (CORS origin, log level, rate limits, etc.) isn't externalized into a `ConfigMap`; it would fall back to the `config/*.ts` namespace defaults unless you add env vars to the Deployment.
- **PodDisruptionBudget** — nothing prevents all 3 replicas from being evicted simultaneously during a node drain.
- **Database / Redis manifests** — the Deployment expects `DATABASE_URL` to point at a database that already exists somewhere reachable from the cluster (a managed Postgres instance, a `StatefulSet` you author, etc.). There is no Postgres `StatefulSet` or `Service` in this repo, unlike the Docker Compose setup for `basic-starter` which does run Postgres alongside the app (see [Docker](./docker)).
- **Namespace / resource labels for multi-environment setups** — the manifest applies directly to whatever namespace is current in your `kubectl` context.

None of the above is inherently wrong for a starter template — it's a minimal example to build from — but don't assume production-readiness beyond what's actually in the file.

## Next Steps

- [Docker](./docker) — build the image this manifest deploys
- [Monitoring](./monitoring) — what `/health/live`, `/health/ready`, and `/metrics` actually do
- [Production Checklist](./checklist) — a curated pre-deploy checklist, including the probe-path mismatch above
