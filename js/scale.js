'use strict';
const SCALE_DESIGN_WIDTH = 1900;
const MOBILE_BREAKPOINT = 640;

function applyPageScale(){
  const wrap = document.getElementById('scaleWrap');
  if(!wrap) return;
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
  const zoom = isMobile ? 1 : window.innerWidth / SCALE_DESIGN_WIDTH;
  wrap.style.zoom = zoom;
  const panelHeightPx = isMobile ? 0 : (window.innerHeight - 28) / zoom;
  document.documentElement.style.setProperty('--panel-height', panelHeightPx + 'px');
}

window.addEventListener('resize', applyPageScale);
applyPageScale();
