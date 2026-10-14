import {z} from "zod";
const id=z.string().uuid(),note=z.string().trim().min(5).max(2000);
export const hiringRoles=["teacher","admin","head_admin","qc","hr","finance","sales_marketing","social_media"] as const;
export const hiringAction=z.discriminatedUnion("action",[
 z.object({action:z.literal("create"),name:z.string().trim().min(2).max(120),email:z.string().email().max(254),role:z.enum(hiringRoles),reviewerId:id,notes:note}).strict(),
 z.object({action:z.literal("schedule"),id,at:z.string().datetime({offset:true}),notes:note}).strict(),
 z.object({action:z.literal("review"),id,kind:z.enum(["hr_interview","department_interview","audition","training"]),score:z.number().int().min(0).max(100),passed:z.boolean(),notes:note}).strict(),
 z.object({action:z.literal("select"),id,notes:note}).strict(),
 z.object({action:z.literal("bind"),id,staffId:id,notes:note}).strict(),
 z.object({action:z.literal("invite"),id,timezone:z.string().max(100)}).strict(),
 z.object({action:z.literal("document"),id,kind:z.enum(["guidelines","agreement"]),fileId:id,notes:note}).strict(),
 z.object({action:z.literal("accept"),id,signedName:z.string().trim().min(2).max(120),agreed:z.literal(true)}).strict(),
 z.object({action:z.literal("handoff"),id,startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),notes:note}).strict(),
 z.object({action:z.literal("activate"),id,notes:note}).strict(),
 z.object({action:z.literal("return"),id,notes:note}).strict(),
 z.object({action:z.literal("reject"),id,notes:note}).strict()
]);
export interface HiringCase{id:string;name:string;email:string;desired_role:string;reviewer_id:string;staff_id:string|null;stage:"applied"|"interview"|"selected"|"ready"|"activated"|"rejected";interview_at:string|null;start_date:string|null;guidelines_file: string|null;agreement_file:string|null;accepted_at:string|null;created_at:string;}
export interface HiringReview{id:string;case_id:string;kind:string;reviewer_id:string;score:number;passed:boolean;notes:string;created_at:string;}
export interface HiringEvent{id:number;case_id:string;actor_id:string;action:string;notes:string;created_at:string;}
export interface HiringDirectory{id:string;name:string;role:string;status:string;timezone:string;email:string|null;}
export interface HiringFile{id:string;target_id:string;category:string;original_name:string;mime:string;complete:boolean;}
