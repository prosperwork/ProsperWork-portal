"use client";
import{useCallback,useEffect,useState,type FormEvent}from"react";
import type{CurrencyRow}from"@/lib/academy/currency";
type Rules={tax_percent:number;finance_profit:boolean;referral_percent:number};
export default function FinanceSettings({role}:{role:string}){
 const[currencies,setCurrencies]=useState<CurrencyRow[]>([]),[rules,setRules]=useState<Rules|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const[editing,setEditing]=useState<CurrencyRow>({code:"",name:"",symbol:"",enabled:true}),[reason,setReason]=useState("");
 const load=useCallback(async()=>{const r=await fetch("/api/currencies",{cache:"no-store"}),d=await r.json();if(!r.ok)throw Error(d.error);setCurrencies(d.currencies);setRules(d.financeRules);},[]);
 useEffect(()=>{void load().catch(()=>setError("Currency and finance settings unavailable."));},[load]);
 if(!["super_admin","finance"].includes(role))return null;
 async function save(url:string,body:unknown){
  setBusy(true);setError("");setNotice("");
  try{const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw Error(d.error||"Blocked");await load();setNotice("Settings saved and reloaded from the database.");}
  catch(e){setError(e instanceof Error?e.message:"Could not save");}finally{setBusy(false);}
 }
 function fx(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);void save("/api/operations",{action:"fx",currency:f.get("currency"),date:f.get("date"),rate:Number(f.get("rate")),notes:f.get("notes")});}
  return <section className="ps-finance-settings" aria-labelledby="finance-settings-heading">
    <header className="ps-finance-heading">
      <h2 id="finance-settings-heading">Currency, conversion and referral settings</h2>
      <p>All financial forms use this database catalog. NGN remains the reporting base. Disabled currencies retain their history and existing agreements but cannot be used for new contracts or pay terms.</p>
    </header>
    {error && <p className="ps-finance-message error" role="alert">{error}</p>}
    {notice && <p className="ps-finance-message success" role="status">{notice}</p>}

    <section className="ps-finance-subsection" aria-labelledby="currency-catalog-heading">
      <div className="ps-finance-subhead"><div><h3 id="currency-catalog-heading">Currency catalog</h3><p>Select a currency to edit its details.</p></div></div>
      <div className="ps-currency-list">{currencies.map(c => <button className={`ps-currency-option${editing.code === c.code ? " selected" : ""}`} key={c.code} type="button" onClick={() => setEditing(c)} disabled={role !== "super_admin"} aria-pressed={editing.code === c.code}>{c.code}<span>{c.name}</span><small>{c.enabled ? "Enabled" : "Disabled"}</small></button>)}</div>
      {role === "super_admin" && <form className="ps-finance-form" onSubmit={e => { e.preventDefault(); void save("/api/currencies", { ...editing, notes: reason }); }}>
        <div className="ps-finance-subhead form-heading"><div><h3>{editing.code ? `Edit ${editing.code}` : "Add currency"}</h3><p>Currency changes apply to new agreements only.</p></div><button className="ps-outline" type="button" onClick={() => setEditing({ code: "", name: "", symbol: "", enabled: true })}>New currency</button></div>
        <div className="ps-finance-fields three">
          <label className="ps-finance-field">Three-letter code<input required pattern="[A-Z]{3}" maxLength={3} value={editing.code} onChange={e => setEditing({ ...editing, code: e.target.value.toUpperCase() })} /></label>
          <label className="ps-finance-field">Currency name<input required minLength={2} maxLength={80} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></label>
          <label className="ps-finance-field">Display symbol<input required maxLength={12} value={editing.symbol} onChange={e => setEditing({ ...editing, symbol: e.target.value })} /></label>
          <label className="ps-finance-check full"><input type="checkbox" checked={editing.enabled} onChange={e => setEditing({ ...editing, enabled: e.target.checked })} />Enabled for new agreements</label>
          <label className="ps-finance-field full">Written reason<textarea required minLength={5} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
        </div>
        <div className="ps-finance-actions"><button className="ps-primary" disabled={busy}>{busy ? "Saving…" : "Save currency"}</button></div>
      </form>}
    </section>

    {role === "super_admin" && rules && <section className="ps-finance-subsection" aria-labelledby="finance-rules-heading">
      <form className="ps-finance-form" onSubmit={e => { e.preventDefault(); void save("/api/operations", { action: "finance_settings", taxPercent: Number(rules.tax_percent), financeProfit: rules.finance_profit, referralPercent: Number(rules.referral_percent) }); }}>
        <div className="ps-finance-subhead form-heading"><div><h3 id="finance-rules-heading">Referral and financial rules</h3><p>These controls apply to future referral credits and financial summaries.</p></div></div>
        <div className="ps-finance-fields">
          <label className="ps-finance-field">One-time referral percentage (0 disables)<input type="number" required min="0" max="100" step="0.01" value={rules.referral_percent} onChange={e => setRules({ ...rules, referral_percent: Number(e.target.value) })} /></label>
          <label className="ps-finance-field">Estimated tax percentage<input type="number" required min="0" max="100" step="0.01" value={rules.tax_percent} onChange={e => setRules({ ...rules, tax_percent: Number(e.target.value) })} /></label>
          <p className="ps-finance-note full">Referral credit applies only after the referred child’s first verified payment and offsets a future invoice in the same currency.</p>
          <label className="ps-finance-check full"><input type="checkbox" checked={rules.finance_profit} onChange={e => setRules({ ...rules, finance_profit: e.target.checked })} />Allow Finance to see estimated profit</label>
        </div>
        <div className="ps-finance-actions"><button className="ps-primary" disabled={busy}>{busy ? "Saving…" : "Save financial rules"}</button></div>
      </form>
    </section>}

    <section className="ps-finance-subsection" aria-labelledby="fx-heading">
      <form className="ps-finance-form" onSubmit={fx}>
        <div className="ps-finance-subhead form-heading"><div><h3 id="fx-heading">Approved dated conversion rate</h3><p>Record the approved rate when a payment gateway does not handle conversion.</p></div></div>
        <p className="ps-finance-note">Rate means NGN per 1 unit. Historical reports use the latest approved rate on or before the transaction date; missing rates are never invented. Today’s dashboard estimate uses today’s approved rate.</p>
        <div className="ps-finance-fields three">
          <label className="ps-finance-field">Currency<select name="currency" required><option value="">Choose currency</option>{currencies.filter(c => c.code !== "NGN").map(c => <option key={c.code}>{c.code}</option>)}</select></label>
          <label className="ps-finance-field">Effective date<input name="date" type="date" required /></label>
          <label className="ps-finance-field">NGN per unit<input name="rate" type="number" min="0.000001" step="0.000001" required /></label>
          <label className="ps-finance-field full">Approval reason<textarea name="notes" minLength={5} maxLength={2000} required /></label>
        </div>
        <div className="ps-finance-actions"><button className="ps-primary" disabled={busy}>{busy ? "Saving…" : "Approve dated rate"}</button></div>
        <p className="ps-finance-note">Approved rates cannot overwrite the same currency/date. Use a new effective date to preserve historical accounting.</p>
      </form>
    </section>
  </section>;
}
