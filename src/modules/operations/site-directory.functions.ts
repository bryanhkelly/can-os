import {createServerFn} from "@tanstack/react-start";
import {getRequest} from "@tanstack/react-start/server";
import {listMySitesService} from "./site-directory.server";
export const listMySites=createServerFn({method:"GET"}).handler(()=>listMySitesService(getRequest()));
