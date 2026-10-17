import { registerSubscriptionPolicy } from "../policy";
import { assignmentMissingSubscriptionPolicy } from "./assignment-missing";

registerSubscriptionPolicy(assignmentMissingSubscriptionPolicy);
