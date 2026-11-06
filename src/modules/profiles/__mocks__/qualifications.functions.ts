import { fn } from "storybook/test";

const unconfigured = async () => { throw new Error("Configure an isolated qualification fixture before calling this Storybook command."); };
export const beginQualificationUpload = fn(unconfigured);
export const decideQualification = fn(unconfigured);
export const finishQualificationUpload = fn(unconfigured);
export const getQualificationEvidence = fn(unconfigured);
export const getQualifications = fn(unconfigured);
