import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({query:vi.fn(),session:vi.fn(),identity:vi.fn()}));
vi.mock("@tanstack/react-query",()=>({useQuery:mocks.query}));
vi.mock("@/components/shell/WorkspaceSession",()=>({
  useWorkspaceSession:mocks.session,workspaceSessionIdentity:mocks.identity,
}));
import {usePrivateWorkspaceScope,usePrivateWorkspaceQuery} from "@/hooks/use-private-workspace-query";
import {usePrivateReportQuery} from "@/hooks/use-private-report-query";
import {useGoDestinationChoices} from "@/hooks/use-go-destination-choices";

const read=vi.fn(async()=>["authorized"]);
describe("private workspace query contract",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    mocks.session.mockReturnValue({session:{authenticated:true},error:null});
    mocks.identity.mockReturnValue("scope-a");
    mocks.query.mockReturnValue({data:["authorized"],isError:false,isFetching:false,isPlaceholderData:false,isPending:false,refetch:vi.fn()});
  });
  it("preserves report namespaces and separates workspace identity",()=>{
    expect(usePrivateWorkspaceScope()).toBe("scope-a");
    expect(usePrivateReportQuery({scope:"scope-a",key:["report",1],read}).data).toEqual(["authorized"]);
    expect(mocks.query.mock.calls[0]![0].queryKey).toEqual(["private-report","scope-a","report",1]);
    usePrivateReportQuery({scope:"scope-b",key:["report",1],read});
    expect(mocks.query.mock.calls[1]![0].queryKey).toEqual(["private-report","scope-b","report",1]);
  });
  it.each(["isError","isFetching","isPlaceholderData"])("suppresses cached data when %s",flag=>{
    mocks.query.mockReturnValue({data:["old"],[flag]:true});
    expect(usePrivateWorkspaceQuery({namespace:"private-test",scope:"scope-a",key:[],read}).data).toBeUndefined();
  });
  it("fails closed without authenticated scope and rejects a disabled query function",()=>{
    mocks.session.mockReturnValue({session:{authenticated:false},error:null});
    expect(usePrivateWorkspaceScope()).toBeNull();
    const result=usePrivateWorkspaceQuery({namespace:"private-test",scope:null,key:[],read});
    expect(result.data).toBeUndefined();
    const config=mocks.query.mock.calls[0]![0];
    expect(config.enabled).toBe(false);
    expect(()=>config.queryFn()).toThrow("Private workspace scope");
    expect(read).not.toHaveBeenCalled();
  });
  it("uses an independent catalog namespace with no stale cache",()=>{
    const choices=[{destination:{kind:"information" as const,journeyId:"learn-more"},title:"Learn",description:"Public"}];
    mocks.query.mockReturnValue({data:choices,isError:false,isFetching:false,isPlaceholderData:false,isPending:false,refetch:vi.fn()});
    expect(useGoDestinationChoices(["site","site-a",null,"information",""],async()=>choices).choices).toEqual(choices);
    expect(mocks.query.mock.calls[0]![0]).toMatchObject({
      queryKey:["go-destination-choices","scope-a","site","site-a",null,"information",""],
      retry:false,staleTime:0,gcTime:0,refetchOnMount:"always",refetchOnWindowFocus:false,
    });
  });
});
