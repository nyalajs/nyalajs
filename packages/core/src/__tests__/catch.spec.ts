import { describe, it, expect } from "vitest";
import { Catch, getCatchTypes } from "../decorators/catch";

class NotFoundError extends Error {}
class ValidationError extends Error {}

@Catch(NotFoundError)
class SingleTypeFilter {
    catch() {}
}

@Catch(NotFoundError, ValidationError)
class MultiTypeFilter {
    catch() {}
}

@Catch()
class CatchAllFilter {
    catch() {}
}

class NoDecoratorFilter {
    catch() {}
}

describe("@Catch()", () => {
    it("records a single error type", () => {
        expect(getCatchTypes(SingleTypeFilter)).toEqual([NotFoundError]);
    });

    it("records multiple error types", () => {
        expect(getCatchTypes(MultiTypeFilter)).toEqual([NotFoundError, ValidationError]);
    });

    it("no arguments means an empty types array (the caller treats that as 'catch everything')", () => {
        expect(getCatchTypes(CatchAllFilter)).toEqual([]);
    });

    it("a class with no @Catch() at all also returns an empty array", () => {
        expect(getCatchTypes(NoDecoratorFilter)).toEqual([]);
    });
});
