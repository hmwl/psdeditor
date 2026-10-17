



const bernstein=t=>[(1-t)**3,3*t*(1-t)**2,3*t*t*(1-t),t**3];
function fitCubic(samples){
 const A=Array.from({length:4},()=>Array(6).fill(0));
 for(let i=0;i<samples.length;i++){const b=bernstein(i/(samples.length-1));for(let r=0;r<4;r++){for(let c=0;c<4;c++)A[r][c]+=b[r]*b[c];A[r][4]+=b[r]*samples[i][0];A[r][5]+=b[r]*samples[i][1];}}
 for(let j=0;j<4;j++){let k=j;for(let r=j+1;r<4;r++)if(Math.abs(A[r][j])>Math.abs(A[k][j]))k=r;[A[j],A[k]]=[A[k],A[j]];const d=A[j][j];if(Math.abs(d)<1e-14)throw new Error('Cylinder fit singular');for(let c=j;c<6;c++)A[j][c]/=d;for(let r=0;r<4;r++)if(r!==j){const v=A[r][j];for(let c=j;c<6;c++)A[r][c]-=v*A[j][c];}}
 return A.map(r=>[r[4],r[5]]);
}
function halfCurve(rect,R,negative){
 const [L,T,Bx,B]=rect,a=(Bx-L)/2,cy=(T+B)/2,cx=(L+Bx)/2,hh=(B-T)/2,theta=Math.PI/2-Math.asin(a/(a+R));
 const raw=Array.from({length:9},(_,j)=>{const t=theta*(8-j)/8;return a*R*Math.sin(t)/(R+a*(1-Math.cos(t)));});
 const points=raw.map(v=>{const x=cx-a*v/raw[0];const y=cy+(negative?-1:1)*Math.sqrt(Math.max(0,hh*hh*(1-(x-cx)**2/(a*a))));return[x,y];});
 const P=fitCubic(points);P[0]=[L,cy];P[1][0]=Math.max(L,P[1][0]);P[3]=[cx,negative?T:B];return P;
}
export function cylinderWarpMesh(values){
 if(!Array.isArray(values)||values.length!==7||!values.every(Number.isFinite))throw new Error('Cylinder requires seven finite warpValues');
 const [L,B,R,T,top,bottom]=values,w=R-L,h=B-T;
 if(!(w>0&&h>=0))throw new Error('Cylinder rectangle invalid');
 const strength=Math.max(0,Math.min(1,values[6])),a=w/2,radius=a*Math.pow(50,strength),dyTop=a*top,dyBottom=a*bottom;
 const pt=halfCurve([L,T-Math.abs(dyTop),R,T+Math.abs(dyTop)],radius,dyTop<0);
 const pb=halfCurve([L,B-Math.abs(dyBottom),R,B+Math.abs(dyBottom)],radius,dyBottom<0);
 const boundary=P=>{const p=Array(13);for(let i=0;i<4;i++){p[i]=P[0].slice();p[i+3]=P[i].slice();p[i+6]=[L+R-P[3-i][0],P[3-i][1]];p[i+9]=[L+R-P[0][0],P[0][1]];}return p;};
 const topRow=boundary(pt),bottomRow=boundary(pb),points=[];
 for(let j=0;j<4;j++)for(let i=0;i<13;i++){const v=j/3;points.push({x:topRow[i][0]+(bottomRow[i][0]-topRow[i][0])*v,y:topRow[i][1]+(bottomRow[i][1]-topRow[i][1])*v});}
 const split=Math.asin(a/(a+radius))/Math.PI;
 return {points,xn:13,yn:4,sliceX:[split,.5,1-split],sliceY:[],warpBounds:{left:L,top:T,right:R,bottom:B},radius,strength};
}
