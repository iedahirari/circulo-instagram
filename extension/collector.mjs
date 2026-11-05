// shortcut: reconhece imagens ligadas a perfis no DOM visível; revisar se o Instagram mudar a estrutura dos links.
export function collectVisibleProfiles() {
  if (location.hostname!=='www.instagram.com' && location.hostname!=='instagram.com') return [];
  const reserved=new Set(['accounts','explore','direct','reels','reel','stories','p','about','legal','privacy','developer','web','challenge']);
  const found=new Map();
  for(const img of document.querySelectorAll('img')) {
    const rect=img.getBoundingClientRect();
    if(!img.complete || !img.naturalWidth || rect.width<20 || rect.height<20 || rect.width>220 || rect.height>220 || rect.bottom<=0 || rect.right<=0 || rect.top>=innerHeight || rect.left>=innerWidth || !img.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})) continue;
    const centerX=(rect.left+rect.right)/2, centerY=(rect.top+rect.bottom)/2;
    if(centerX<0 || centerX>=innerWidth || centerY<0 || centerY>=innerHeight || document.elementFromPoint(centerX,centerY)!==img)continue;
    // Only associate a photo with its own profile link, never a neighboring account.
    const link=img.closest('a[href]');
    if(!link)continue;
    let href, photo;
    try{href=new URL(link.href,location.href);photo=new URL(img.currentSrc||img.src);}catch{continue;}
    const match=/^\/([a-zA-Z0-9_.]{1,30})\/?$/.exec(href.pathname);
    if(href.origin!==location.origin || !match || reserved.has(match[1].toLowerCase()) || photo.protocol!=='https:' || !/\.(cdninstagram\.com|fbcdn\.net)$/.test(photo.hostname) || photo.username || photo.password || (photo.port && photo.port!=='443'))continue;
    found.set(match[1].toLowerCase(),{username:match[1].toLowerCase(),url:photo.href});
    if(found.size===100)break;
  }
  return [...found.values()];
}
export function allowedPhotoUrl(value) {
  try{const url=new URL(value);return url.protocol==='https:' && /\.(cdninstagram\.com|fbcdn\.net)$/.test(url.hostname) && !url.username && !url.password && (!url.port || url.port==='443');}catch{return false;}
}
