// Core's iOS PWA shell should occupy the browser's *paintable* viewport.
// window.innerHeight alone is not reliable on every standalone WKWebView.
// Never use screen.height: it includes the home-indicator/system region.
export function reconcileIosPwaViewport({
 innerHeight=0,documentHeight=0,visualHeight=0,cssDvhHeight=0
}={}){
 const measurements=[innerHeight,documentHeight,visualHeight,cssDvhHeight]
  .map(Number).filter(n=>Number.isFinite(n)&&n>=240&&n<=5000);
 if(!measurements.length)return 240;
 return Math.round(Math.max(...measurements));
}
