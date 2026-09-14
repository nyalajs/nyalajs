export function getResourceTemplate(className: string): string {
    return `// A resource shapes a model/entity into the JSON your API returns.
// Wire it into a controller manually, e.g.:
//   return ${className}.collection(items);
export class ${className} {
  static make(item: any) {
    return {
      // TODO: pick the fields to expose
      id: item.id,
    };
  }

  static collection(items: any[]) {
    return items.map((item) => ${className}.make(item));
  }
}
`;
}
