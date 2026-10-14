"use client";
import{useEffect,useState}from"react";
import type{CurrencyRow}from"./currency";
export function useCurrencies(){
 const[currencies,setCurrencies]=useState<CurrencyRow[]>([]),[rates,setRates]=useState<{currency:string;date:string;rate:number}[]>([]),[currencyError,setError]=useState("");
 useEffect(()=>{let alive=true;fetch("/api/currencies",{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok||!Array.isArray(d.currencies))throw Error(d.error||"Currency settings unavailable");if(alive){setCurrencies(d.currencies);setRates(d.rates||[]);}}).catch(()=>{if(alive)setError("Currency settings could not be loaded. New financial forms are unavailable until retry.");});return()=>{alive=false;};},[]);
 return{currencies,rates,currencyError};
}
export function convertToNgn(amount:number,currency:string,date:string,rates:{currency:string;date:string;rate:number}[]){
 if(currency==="NGN")return amount;
 const quote=rates.filter(r=>r.currency===currency&&r.date<=date).sort((a,b)=>b.date.localeCompare(a.date))[0];
 return quote?amount*Number(quote.rate):Number.NaN;
}
