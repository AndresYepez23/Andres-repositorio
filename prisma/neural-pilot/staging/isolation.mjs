// Shared only by staging tooling. The former staging DB is now used by Queen
// in production; never accept it just because a caller labels it "staging".
export const STAGING_DATABASE='6a3256b2-c016-4650-9759-79aca3b4446f';
export function assertStagingBuildConfig(config){
 const databases=[...config.matchAll(/^\s*(?:preview_)?database_id\s*=\s*"([^"]+)"/gm)].map(m=>m[1]);
 if(!/^name\s*=\s*"prisma-queen-staging"\s*$/m.test(config)||databases.length!==8||databases.some(id=>id!==STAGING_DATABASE))
  throw Error('UNSAFE_STAGING_CONFIG');
}
export function stagingHealthReady(result,{requireQueen=false,expectedCommit=null}={}){
 const b=result?.body;
 return result?.httpStatus===200&&b?.ok===true&&b.databaseId===STAGING_DATABASE&&b.environment==='staging'&&
  (!requireQueen||b.queenEnabled===true&&Array.isArray(b.missingSecrets)&&b.missingSecrets.length===0)&&
  (!expectedCommit||b.sourceCommit===expectedCommit);
}
