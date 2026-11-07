import { createContext, useContext } from "react";
import { schoolConfigurationNavigation, type SchoolConfigurationContext } from "@/domain/school-configuration";
const ConfigurationContext=createContext<SchoolConfigurationContext>("launch");
export const SchoolConfigurationContextProvider=ConfigurationContext.Provider;
export function useSchoolConfigurationNavigation(){return schoolConfigurationNavigation(useContext(ConfigurationContext));}
