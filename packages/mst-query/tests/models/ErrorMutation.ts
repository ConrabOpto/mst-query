import { createMutation } from "../../src";

export const ErrorMutation = createMutation('ErrorMutation', {
    async endpoint() {
        throw new Error('Server side error');
    }
});