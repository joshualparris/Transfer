import{describe,expect,it,vi}from'vitest';
import{isRetryable,withRetry}from'../electron/gmail';
describe('network resilience',()=>{
  it('classifies DNS failures as transient',()=>expect(isRetryable({code:'ENOTFOUND'})).toBe(true));
  it('retries a transient discovery request',async()=>{vi.useFakeTimers();let calls=0;const result=withRetry(async()=>{calls++;if(calls===1)throw Object.assign(new Error('dns'),{code:'ENOTFOUND'});return'ok'},undefined,2);await vi.runAllTimersAsync();await expect(result).resolves.toBe('ok');expect(calls).toBe(2);vi.useRealTimers()});
});
