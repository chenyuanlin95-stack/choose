import React from 'react';
const animals=['狐','熊','兔','犬','猫','棕熊','蛙','企鹅','考拉','虎','狮','浣熊','鸭','獭','鸮','鹿','猪','羊','象','鸡'];
const faces=['🦊','🐼','🐰','🐶','🐱','🐻','🐸','🐧','🐨','🐯','🦁','🦝','🦆','🦦','🦉','🦌','🐷','🐑','🐘','🐥'];
const hues=[18,210,338,30,205,25,112,220,185,36,42,14,48,190,265,20,345,285,205,50];
export function AnimalAvatar({index=0,size=52,className=''}:{index?:number,size?:number,className?:string}){const i=index%20;return <div className={'animal-avatar '+className} style={{width:size,height:size,background:`hsl(${hues[i]} 88% 88%)`,fontSize:size*.55}} title={animals[i]}>{faces[i]}</div>}
export {animals};