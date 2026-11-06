import { fn } from "storybook/test";

const unconfigured = async () => { throw new Error("Configure an isolated launch draft fixture before calling this Storybook command."); };
export const getStaffLaunchWorkspace = fn(unconfigured);
export const getLaunchStudioDraft = fn(unconfigured);
export const saveLaunchStudioDraft = fn(unconfigured);
