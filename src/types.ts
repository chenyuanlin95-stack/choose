export type QuestionType='binary'|'ranking';export type RoomPhase='lobby'|'ready'|'answering'|'reveal'|'ended';
export interface Option{ id:string; label:string }
export interface Question{ id:string; type:QuestionType; prompt:string; options:Option[]; category:string; enabled:boolean }
export interface Player{ id:string; room_id:string; name:string; avatar:number; joined_at?:string }
export interface Room{ id:string; code:string; phase:RoomPhase; current_question_id:string|null; round:number; host_token?:string }
export interface Answer{ id?:string; room_id:string; question_id:string; player_id:string; choice?:string; ranking?:string[]; comment?:string|null; created_at?:string }
