// Structured evidence checks shared by the diagnostic and release runners.
// A successful subprocess without any executed tests is not acceptance.
export function interactionEvidenceErrors(report){
 const errors=[];
 if(!report||!Array.isArray(report.testResults)||!report.testResults.length)return ["Missing interaction test results"];
 if(!Number.isInteger(report.numPassedTests)||report.numPassedTests<1)errors.push("No passing interaction tests recorded");
 if(report.numFailedTests!==0||report.numFailedTestSuites!==0||report.success!==true)errors.push("Interaction results are incomplete or failed");
 if(report.testResults.some(file=>file.status==="failed"||file.assertionResults?.some(test=>test.status==="failed")))errors.push("Failed interaction assertion or suite");
 return errors;
}
export function browserEvidenceErrors(report){
 const errors=[],stats=report?.stats;
 if(!stats||!Array.isArray(report.suites)||!report.suites.length)return ["Missing browser test results"];
 if(!Number.isInteger(stats.expected)||stats.expected<1)errors.push("No passing browser tests recorded");
 if(stats.unexpected!==0||stats.flaky!==0)errors.push("Browser results are incomplete, failed or flaky");
 if(!Array.isArray(report.errors)||report.errors.length)errors.push("Browser runner reported errors or missing error evidence");
 return errors;
}
