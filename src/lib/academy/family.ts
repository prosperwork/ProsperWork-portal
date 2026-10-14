import {z} from "zod";
const child=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),pin=z.string().regex(/^\d{4}$/);
export const familyAction=z.discriminatedUnion("action",[
 z.object({
  action: z.literal("create_student"),
  name: z.string().trim().min(2).max(120),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  instrument: z.string().trim().min(2).max(80),
  timezone: z.string().trim().min(2).max(80).optional(),
  consent: z.boolean().optional(),
  createLogin: z.boolean().optional(),
  studentPassword: z.string().min(8).max(128).optional(),
  password: z.string().min(8).max(128).optional(),
 }).strict(),
 z.object({action:z.literal("student_account"),childId:child,password:z.string().min(8).max(128)}).strict(),
 z.object({action:z.literal("student_password"),childId:child,password:z.string().min(8).max(128)}).strict(),
 z.object({action:z.literal("pin"),pin,password:z.string().min(1).max(128)}).strict(),
 z.object({action:z.literal("enter_kid"),childId:child}).strict(),
 z.object({action:z.literal("exit_kid"),pin}).strict(),
 z.object({action:z.literal("media_consent"),childId:child,consent:z.boolean()}).strict(),
]);
export const policyAction=z.discriminatedUnion("action",[
 z.object({action:z.literal("draft"),key:z.string().regex(/^[a-z][a-z0-9_-]{2,49}$/),title:z.string().trim().min(3).max(150),audienceParentId:z.string().uuid().nullable().optional()}).strict(),
 z.object({action:z.literal("publish"),id:z.string().uuid()}).strict(),
 z.object({action:z.literal("accept"),ids:z.array(z.string().uuid()).min(1).max(30)}).strict(),
]);
export interface PolicyVersion{id:string;key:string;title:string;version:number;file_id:string|null;published_at:string|null;created_at:string;}
export interface FamilyResponse{profile:{id:string;name:string;role:string;status:string;timezone?:string};pinConfigured:boolean;kidMode:boolean;children:{id:string;name:string;dob:string;instrument?:string;timezone:string;studentUserId:string|null;username:string|null;avatarFileId:string|null;consent:boolean;rank:string}[];avatarFileId:string|null;}
