/** An exact literal substring for parameterized PostgreSQL ILIKE.
 * '%' and '_' are user data, not wildcard operators; backslash is escaped.
 * Used only after verifying the Site-scoped operator permission.
 */
export function goLikeContainsLiteral(value:string):string {
  const text=value.trim().slice(0,80);
  return "%"+text.replace(/[\\%_]/g,character=>"\\"+character)+"%";
}
