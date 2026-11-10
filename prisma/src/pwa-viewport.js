// iOS standalone can report a CSS webview height smaller than the screen.
// Recover only the visibly unused portion ABOVE the home-indicator safe area.
// Never size to the physical screen unconditionally: that clips the composer.
export function recoverIosPwaBottomSpace({
  isIOS=false,standalone=false,keyboardOpen=false,
  screenHeight=0,screenWidth=0,layoutHeight=0,viewportWidth=0,
  safeBottom=0,scale=1
}={}){
  if(!isIOS||!standalone||keyboardOpen)return 0;
  const screen=Number(screenHeight),layout=Number(layoutHeight);
  const width=Number(screenWidth),viewWidth=Number(viewportWidth);
  const safe=Number(safeBottom),zoom=Number(scale);
  if(![screen,layout,width,viewWidth,safe,zoom].every(Number.isFinite))return 0;
  // No guessed physical-space corrections: require real iOS safe-area data,
  // unzoomed portrait geometry, and matching CSS-pixel screen widths.
  if(safe<12||safe>65||zoom<.99||zoom>1.01||width<=0||viewWidth<=0||
    screen<layout||screen<=width||Math.abs(width-viewWidth)>8)return 0;
  const unused=screen-layout;
  // Large differences usually mean device rotation, another window layout
  // or stale viewport metrics. An extension would obscure controls.
  if(unused<safe+9||unused>118)return 0;
  // Preserve the entire system home-indicator inset plus 6 CSS pixels.
  const recovery=Math.min(28,Math.max(0,Math.floor(unused-safe-6)));
  return recovery>=5?recovery:0;
}
