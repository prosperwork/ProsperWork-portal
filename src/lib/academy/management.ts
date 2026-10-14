import {z} from "zod";
const id=z.string().min(1).max(100),uuid=z.string().uuid(),notes=z.string().trim().min(5).max(4000);
export const deskKinds=["trial_request","callback","nursery","winback","exit_feedback","dispute","priority","monthly_report","shadow_request","personal_teaching"] as const;
export const managementAction=z.discriminatedUnion("action",[
 z.object({action:z.literal("rules"),stagnantDays:z.number().int().min(1).max(365),emptyBoardClasses:z.number().int().min(1).max(10),followupHours:z.number().int().min(1).max(168),escalationHours:z.number().int().min(1).max(168),lateGraceMinutes:z.number().int().min(0).max(60),notes}).strict(),
 z.object({action:z.literal("create"),kind:z.enum(deskKinds),studentId:id.optional(),leadId:id.optional(),staffId:uuid.optional(),assignedTo:uuid,at:z.string().datetime({offset:true}),slots:z.array(z.string().datetime({offset:true})).max(10).default([]),notes}).strict(),
 z.object({action:z.literal("update"),id:uuid,revision:z.number().int().positive(),status:z.enum(["open","in_progress","completed","cancelled"]),notes}).strict(),
 z.object({action:z.literal("hierarchy"),adminId:uuid,headId:uuid,quota:z.number().int().min(0).max(1000),notes}).strict(),
 z.object({action:z.literal("announcement"),title:z.string().trim().min(1).max(160),body:notes,roles:z.array(z.enum(["super_admin","head_admin","admin","teacher","qc","hr","finance","sales_marketing","social_media","parent","student"])).min(1).max(11),expiresAt:z.string().datetime({offset:true})}).strict(),
 z.object({action:z.literal("announcement_archive"),id:uuid,notes}).strict(),
 z.object({action:z.literal("emergency_cover"),lessonId:id,teacherId:uuid,adminId:uuid,notes}).strict(),
 z.object({action:z.literal("deactivate"),staffId:uuid,confirm:z.literal("DEACTIVATE"),notes}).strict(),
 z.object({action:z.literal("preview"),staffId:uuid,notes}).strict(),
]);
export type ManagementAction=z.infer<typeof managementAction>;
