import type {Question,Player} from '../types';export const demoQuestions:Question[]=[
{id:'q1',type:'binary',prompt:'有毒但上头的爱情 VS 健康稳定但无聊的爱情',options:[{id:'A',label:'有毒但上头的爱情'},{id:'B',label:'健康稳定但无聊的爱情'}],category:'恋爱',enabled:true},
{id:'q2',type:'binary',prompt:'永远有钱去旅行 / 永远有时间去旅行',options:[{id:'A',label:'永远有钱去旅行'},{id:'B',label:'永远有时间去旅行'}],category:'两个都想要',enabled:true},
{id:'q3',type:'binary',prompt:'朋友把你明确要求保密的秘密告诉了一个人，没有造成实际后果，并认真道歉',options:[{id:'A',label:'可以恢复到原来的关系'},{id:'B',label:'永远无法恢复到原来的信任'}],category:'友情',enabled:true},
{id:'q4',type:'ranking',prompt:'请按恋爱中对你的重要程度排序',options:[{id:'o1',label:'有趣'},{id:'o2',label:'情绪稳定'},{id:'o3',label:'外貌'},{id:'o4',label:'事业'},{id:'o5',label:'浪漫'}],category:'排序',enabled:true}
];
export const demoPlayers:Player[]=['小周','阿橙','Luna','大熊','momo','KK','汤圆'].map((name,i)=>({id:'p'+i,room_id:'demo',name,avatar:i}));