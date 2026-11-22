// Retry a malformed model JSON response once; never retry arbitrary tool starts or API failures.
export async function retryMalformedJson<T>(operation:(attempt:number)=>Promise<T>):Promise<T>{
 try{return await operation(0);}catch(error){if(!(error instanceof SyntaxError))throw error;return operation(1);}
}
