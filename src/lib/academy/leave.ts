import { z } from "zod";
const id=z.string().uuid(),reason=z.string().trim().min(5).max(2000);
export const leaveAction=z.discriminatedUnion("action",[
 z.object({action:z.literal("request"),staffId:id.optional(),route:z.enum(["hr","head_admin"]),kind:z.enum(["leave","exam_break","sick_leave"]),startsAt:z.iso.datetime({offset:true}),endsAt:z.iso.datetime({offset:true}),reason}).strict(),
 z.object({action:z.enum(["forward","finalize"]),id}).strict(),
 z.object({action:z.enum(["hr_approve","reject","cancel"]),id,reason}).strict(),
 z.object({action:z.literal("plan"),id,studentId:z.string().min(1).max(100),coverId:id}).strict()
]);
export interface StaffLeave {id:string;staff_id:string;submitted_by:string;route:"hr"|"head_admin";kind:"leave"|"exam_break"|"sick_leave";reason:string;starts_at:string;ends_at:string;state:"submitted"|"forwarded"|"hr_approved"|"approved"|"active"|"completed"|"rejected"|"cancelled";hr_by:string|null;head_by:string|null;decision_reason:string|null;synchronization_error:string|null;synchronization_attempts:number}
export interface LeaveCover {id:string;leave_id:string;student_id:string;cover_id:string;duty:"teacher"|"admin";original_id:string;applied_at:string|null}
export interface LeaveData {profile:{id:string;name:string;role:string;status:string;timezone:string};leaves:StaffLeave[];covers:LeaveCover[];coverTimeline:Pick<StaffLeave,"id"|"staff_id"|"starts_at"|"ends_at"|"state">[];directory:{id:string;name:string;role:string;status:string;timezone:string}[];students:{id:string;teacher_id:string;admin_id:string|null;parent_id:string;payload:{name:string;status:string;teacherName:string;adminName:string;timezone:string}}[];serverNow:string}
