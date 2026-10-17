
const ids=new WeakMap(), pending=new WeakMap(); let serial=0;
export function profileIdentity(profile) {
  if(!profile)return 'none';
  if(!ids.has(profile))ids.set(profile,`profile-object-${++serial}`);
  return ids.get(profile);
}
export async function identifyProfile(profile) {
  if(!profile?.bytes?.length)return profile;
  if(!pending.has(profile))pending.set(profile,(async()=>{
    const bytes=new Uint8Array(profile.bytes);
    if(globalThis.crypto?.subtle){
      const hash=await crypto.subtle.digest('SHA-256',bytes);
      ids.set(profile,'icc-sha256:'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''));
    }else{
      
      let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
      ids.set(profile,'icc-bytes:'+btoa(text));
    }
    return profile;
  })());
  return pending.get(profile);
}
