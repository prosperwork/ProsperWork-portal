"use client";
import{useCurrencies}from"./use-currencies";
export default function CurrencySelect({value,onChange,required=false}:{value:string;onChange:(value:string)=>void;required?:boolean}){
 const{currencies,currencyError}=useCurrencies();
 return <><select required={required} value={value} onChange={e=>onChange(e.target.value)}><option value="">Choose configured currency</option>{currencies.filter(c=>c.enabled||c.code===value).map(c=><option key={c.code} value={c.code}>{c.code} · {c.name}{c.enabled?"":" (disabled for new agreements)"}</option>)}</select>{currencyError&&<span role="alert">{currencyError}</span>}</>;
}
