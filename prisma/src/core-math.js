// Bounded arithmetic grammar; no eval, Function, property access or executable code.
export function evaluateCoreExpression(input){
 const raw=String(input).replace(/,/g,'.').replace(/×/g,'*').replace(/÷/g,'/');
 if(raw.length>180||!/^[\d\s.+*/()^%-]+$/.test(raw))return null;
 const tokens=raw.match(/\d+(?:\.\d+)?|\.\d+|[()+*/^%-]/g)||[];let i=0,depth=0;
 function atom(){if(++depth>20)throw Error('Expresión demasiado anidada.');let n;const t=tokens[i++];if(t==='('){n=sum();if(tokens[i++]!==')')throw Error('Paréntesis incompletos.');}else{n=Number(t);if(t===undefined||!Number.isFinite(n))throw Error('Número inválido.');}depth--;return n;}
 function power(){let n=atom();if(tokens[i]==='^'){i++;const e=unary();if(Math.abs(e)>1000)throw Error('Exponente demasiado grande.');n=n**e;}return n;}
 function unary(){if(tokens[i]==='+'||tokens[i]==='-'){const op=tokens[i++];return (op==='-'?-1:1)*unary();}return power();}
 function product(){let n=unary();while(['*','/','%'].includes(tokens[i])){const op=tokens[i++],v=unary();if((op==='/'||op==='%')&&v===0)throw Error('No se puede dividir entre cero.');n=op==='*'?n*v:op==='/'?n/v:n%v;}return n;}
 function sum(){let n=product();while(['+','-'].includes(tokens[i])){const op=tokens[i++],v=product();n=op==='+'?n+v:n-v;}return n;}
 const n=sum();if(i!==tokens.length||!Number.isFinite(n))throw Error('Expresión incompleta o resultado fuera de rango.');return n;
}
