import { fn } from "storybook/test";

const unconfigured = async () => { throw new Error("Configure an isolated student profile fixture before calling this Storybook command."); };
export const getStudentSelfProfile = fn(unconfigured);
export const saveStudentSelfProfile = fn(unconfigured);
