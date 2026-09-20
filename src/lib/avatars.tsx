const animals=['狐狸','熊猫','兔子','柴犬','猫咪','棕熊','青蛙','企鹅','考拉','老虎','狮子','浣熊','鸭子','水獭','猫头鹰','小鹿','小猪','绵羊','大象','小鸡'];
export function AnimalAvatar({index=0,size=52,className=''}:{index?:number;size?:number;className?:string}){const i=((index%20)+20)%20;return <div role="img" aria-label={animals[i]+'头像'} className={'animal-avatar '+className} style={{width:size,height:size,backgroundImage:'url(/assets/animal-portraits.webp)',backgroundSize:'500% 400%',backgroundPosition:`${i%5*25}% ${Math.floor(i/5)*100/3}%`}} title={animals[i]}/>}
export {animals};


