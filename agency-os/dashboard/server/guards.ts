export function authorize(user:{id:string,expires:number}|null,owner:string){return !!owner && !!user && user.id===owner && user.expires>Date.now()}
export function validateSchedule(value:unknown){if(value===null)return null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value))||Date.parse(value)<=Date.now())throw Error('Choose a future date and time.');return new Date(value).toISOString()}

