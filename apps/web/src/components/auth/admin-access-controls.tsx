"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { authRequest } from "@/lib/native-auth-client";
import { CustomDropdown } from "@/components/crm-workspace/tasks-workbench";
import { AuthField, authButton, authInput } from "./account-form";
const roles = [{value:"DELIVERY_LEAD",label:"Delivery Lead"},{value:"SALES_OWNER",label:"Sales Owner"},{value:"FINANCE_ADMIN",label:"Finance Admin"},{value:"FOUNDER_GM",label:"Founder / General Manager"}];
type Invitation = {id:string;email:string;displayName?:string;roleCode:string;status:string;expiresAt:string};
export function AdminInvitations() {
  const {user} = useAuth(); const [open,setOpen] = useState(false); const [rows,setRows] = useState<Invitation[]>([]);
  const [email,setEmail] = useState(""); const [displayName,setName] = useState(""); const [roleCode,setRole] = useState("DELIVERY_LEAD");
  const [busy,setBusy] = useState(false); const [error,setError] = useState(""); const [message,setMessage] = useState("");
  const allowed = user?.role === "FOUNDER_GM";
  async function load(){ const r = await authRequest<{data:Invitation[]}>("admin/invitations"); setRows(r.data); }
  useEffect(() => {if(open && allowed) void load().catch(e=>setError(e.message));},[open,allowed]);
  async function create(e:FormEvent){e.preventDefault();setBusy(true);setError("");setMessage("");try{await authRequest("admin/invitations",{email,displayName,roleCode});setEmail("");setName("");setMessage("Invitation created. Delivery is handled by your workspace email service.");await load();}catch(e){setError(e instanceof Error?e.message:"Unable to invite.");}finally{setBusy(false);}}
  async function revoke(id:string){setBusy(true);setError("");try{await authRequest(`admin/invitations/${encodeURIComponent(id)}/revoke`,{});await load();setMessage("Invitation revoked. Its link can no longer be used.");}catch(e){setError(e instanceof Error?e.message:"Unable to revoke.");}finally{setBusy(false);}}
  if(!allowed) return null;
  return <section className="mb-5 rounded-xl border border-border bg-card p-4">
    <button className="min-h-11 text-sm font-semibold text-primary" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?"Close invitations":"Invite team members"}</button>
    {open && <div className="mt-3 space-y-4">
      <p className="text-xs text-muted-foreground">Invite a colleague with the least access they need. To resend, revoke the old invitation and create a new one.</p>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={create}>
        <AuthField label="Email"><input type="email" required className={authInput} value={email} onChange={e=>setEmail(e.target.value)}/></AuthField>
        <AuthField label="Full name"><input className={authInput} value={displayName} maxLength={120} onChange={e=>setName(e.target.value)}/></AuthField>
        <CustomDropdown label="Workspace role" value={roleCode} options={roles} onChange={setRole}/>
        <button disabled={busy} className={`${authButton} self-end`}>Create invitation</button>
      </form>
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{message&&<p role="status" className="text-sm text-success">{message}</p>}
      <div className="space-y-2">{rows.length===0?<p className="text-xs text-muted-foreground">No invitations yet.</p>:rows.map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"><div><p className="text-sm font-medium">{r.email}</p><p className="text-xs text-muted-foreground">{r.roleCode} · {r.status} · Expires {new Date(r.expiresAt).toLocaleDateString()}</p></div>{r.status.toLowerCase()==="pending"&&<button disabled={busy} className="min-h-11 text-sm text-destructive" onClick={()=>void revoke(r.id)}>Revoke invitation</button>}</div>)}</div>
    </div>}
  </section>;
}
export function AdminMemberControls({userId,status,currentRole}:{userId:string;status:string;currentRole:string}) {
  const {user}=useAuth(); const [roleCode,setRole]=useState(currentRole);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const [confirm,setConfirm]=useState<"role"|"deactivate"|"reactivate"|"revoke-sessions"|null>(null);
  async function execute(){if(!confirm)return;setBusy(true);setError("");try{
    if(confirm==="role"||confirm==="reactivate")await authRequest(`admin/users/${encodeURIComponent(userId)}/${confirm}`,confirm==="role"?{roleCode}:{},confirm==="role"?"PATCH":"POST");
    else {const r=await fetch(`/api/admin/users/${encodeURIComponent(userId)}/${confirm}`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});if(!r.ok){const b=await r.json();throw new Error(b.message||"Unable to update member.");}}
    window.location.reload();
  }catch(e){setError(e instanceof Error?e.message:"Unable to update member.");}finally{setBusy(false);}}
  if(user?.role!=="FOUNDER_GM")return null;
  return <section className="space-y-3 rounded-xl border border-border bg-card p-5"><h2 className="font-semibold">Workspace access</h2><p className="text-xs text-muted-foreground">Changes apply immediately. The last active administrator is protected.</p>
    <div className="flex flex-wrap items-end gap-3"><div className="w-full min-w-0 sm:w-64 sm:shrink-0"><CustomDropdown label="Workspace role" value={roleCode} options={roles} onChange={setRole}/></div><button className={authButton} disabled={busy||roleCode===currentRole} onClick={()=>setConfirm("role")}>Change role</button><button disabled={busy} className="min-h-11 rounded-xl border border-border px-3 text-sm" onClick={()=>setConfirm(status==="active"?"deactivate":"reactivate")}>{status==="active"?"Suspend access":"Restore access"}</button><button disabled={busy} className="min-h-11 px-3 text-sm text-destructive" onClick={()=>setConfirm("revoke-sessions")}>Revoke all sessions</button></div>
    {confirm&&<div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"><p className="text-sm">Confirm {confirm.replaceAll("-"," ")}{confirm==="role"?` to ${roleCode}`:""} for this member?</p><button disabled={busy} className={authButton} onClick={()=>void execute()}>Confirm change</button><button className="min-h-11 text-sm" onClick={()=>setConfirm(null)}>Cancel</button></div>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
