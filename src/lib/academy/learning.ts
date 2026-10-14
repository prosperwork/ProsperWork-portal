import { z } from "zod";
const id=z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const text=z.string().trim().max(20000);
export const learningAction=z.discriminatedUnion("action",[
 z.object({action:z.literal("board"),lessonId:id,revision:z.number().int().min(0),notes:text,nextTopics:text,completedTopics:z.array(z.string().trim().min(1).max(500)).max(200)}).strict(),
 z.object({action:z.literal("resource"),id,title:z.string().trim().min(1).max(120),type:z.enum(["song","guide","exercise","video"]),instrument:z.string().trim().min(1).max(120),level:z.string().trim().min(1).max(120),summary:z.string().trim().max(4000),revision:z.number().int().min(0)}).strict(),
 z.object({action:z.literal("archive_resource"),id,revision:z.number().int().min(1)}).strict(),
]);
export interface LiveBoard {lesson_id:string; original_notes:string; notes:string; next_topics:string; completed_topics:string[]; revision:number; updated_at:string; updated_by:string;}
export interface LearningResource {id:string;title:string;type:"song"|"guide"|"exercise"|"video";instrument:string;level:string;summary:string;fileId?:string;fileName?:string;}
export interface LessonRecording {
  id: string;
  target_id: string;
  original_name: string;
  mime: string;
  bytes: number;
  created_at: string;
}

export interface LearningResponse {
  profile:{id:string;name:string;role:string;status:string;timezone:string};
  lessons:{id:string;studentId:string;studentName:string;teacherName:string;teacherId:string;title:string;startsAt:string;studentTimezone:string;notes:string;nextTopics:string;status:string}[];
  boards:LiveBoard[]; resources:{payload:LearningResource;revision:number}[];
  recordings?: LessonRecording[];
}
