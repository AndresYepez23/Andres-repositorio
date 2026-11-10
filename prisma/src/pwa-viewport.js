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

// Installed iPhone PWAs can expose LESS height in innerHeight, visualViewport
// and 100dvh than the actual screen. A dark strip remains below the chat
// although its composer already has zero bottom padding. Only for a tall
// portrait iPhone in standalone mode, reclaim the difference up to a point
// that still reserves the complete home-indicator safe area plus 6 CSS px.
//
// Unlike using screen.height directly as the app height, this is bounded,
// requires matching CSS-pixel widths and a 1x visual scale, and is disabled
// whenever the software keyboard is visible.
export function recoverIosStandaloneBottomGap({
 isIOS=false,standalone=false,keyboardOpen=false,
 screenWidth=0,screenHeight=0,viewportWidth=0,
 layoutHeight=0,safeInsetBottom=0,visualScale=1
}={}){
 if(!isIOS||!standalone||keyboardOpen)return 0;
 const nums=[screenWidth,screenHeight,viewportWidth,layoutHeight,
  safeInsetBottom,visualScale].map(Number);
 if(nums.some(n=>!Number.isFinite(n)))return 0;
 const [sw,sh,vw,layout,safe,scale]=nums;
 if(sw<300||sw>540||sh<600||sh<=sw*1.75)return 0;
 if(Math.abs(sw-vw)>6||Math.abs(scale-1)>.03)return 0;
 // Modern iPhones normally report ~34px. Some standalone WKWebViews
 // incorrectly report 0 despite having a home indicator: reserve 34px
 // only for the unambiguously tall phone aspect ratio (>= 2:1).
 const protectedInset=safe>=18&&safe<=60?safe:
  (safe>=0&&safe<18&&sh/sw>=2?34:0);
 if(protectedInset<18)return 0;
 const safeTarget=Math.floor(sh-protectedInset-6);
 const gap=safeTarget-layout;
 // A very large discrepancy indicates mismatched device/window geometry;
 // refuse rather than risk rendering below the display.
 if(gap<5||gap>55)return 0;
 return Math.min(30,Math.floor(gap));
}
