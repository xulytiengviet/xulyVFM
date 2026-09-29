export const MAX_EXPANDED_BYTES=192*1024*1024;
export async function readBoundedStream(stream,limit=MAX_EXPANDED_BYTES){
  const reader=stream.getReader(),parts=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new Error('Dữ liệu giải nén vượt giới hạn an toàn.');}parts.push(value);}}
  finally{reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;
}
