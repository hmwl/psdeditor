








const PAIRS = `
Mk  :make setd:set Dlt :delete Dplc:duplicate slct:select Shw :show Hd  :hide move:move Trnf:transform Fl  :fill
Invs:inverse Fthr:feather Expn:expand Cntc:contract Brdr:border Smth:smooth Mrg2:mergeLayersNew MrgV:mergeVisible
FltI:flattenImage ImgS:imageSize CnvS:canvasSize Rtte:rotateEventEnum Flip:flip RvlA:revealAll Crop:crop Invr:invert
Dstt:desaturate Eqlz:equalize AddT:addTo SbtF:subtractFrom IntW:intersectWith BrgC:brightnessEvent Pstr:posterization
Thrs:thresholdClassEvent Lvls:levels Crvs:curves HStr:hueSaturation ClrB:colorBalance save:save Opn :open Cls :close
Stop:stop getd:get Rvrt:revert Undo:undo Rslt:result Ply :play CpyM:copyMerged copy:copy past:paste cut :cut
GsnB:gaussianBlur UnsM:unsharpMask MtnB:motionBlur AdNs:addNoise Mdn :median Blr :blur BlrM:blurMore Shrp:sharpen
ShrM:sharpenMore ShrE:sharpenEdges Embs:emboss FndE:findEdges Msc :mosaic Pntl:pointillize Crst:crystallize Clds:clouds
DfrC:differenceClouds HghP:highPass Mxm :maximum Mnm :minimum Ofst:offset Twrl:twirl Sphr:spherize Pnch:pinch
Rple:ripple Slrz:solarize RdlB:radialBlur Dspc:despeckle DstS:dustAndScratches TrcC:traceContour Fct :facet
Frgm:fragment Avrg:average Plr :polar Dfs :diffuse
Lyr :layer Dcmn:document Chnl:channel Path:path Clr :color RGBC:RGBColor HSBC:HSBColorClass Grsc:grayscale
LbCl:labColor CMYC:CMYKColorClass Rctn:rectangle Elps:ellipse Gdnt:gradient Ptrn:pattern
AdjL:adjustmentLayer contentLayer:contentLayer SoCo:solidColorLayer HstS:historyState SnpS:snapshotClass
Actn:action ASet:actionSet Cmnd:command Prpr:property Bckg:backgroundLayer Ordn:ordinal Trgt:targetEnum
Frst:first Lst :last Nxt :next Prvs:previous Frwr:forwardEnum Bckw:backwardEnum Frnt:front Back:back
Al  :allEnum None:none T   :to null:target Usng:using Nm  :name Opct:opacity Md  :mode BlnM:blendMode
Vsbl:visible Hrzn:horizontal Vrtc:vertical Wdth:width Hght:height Rslt:resolution Top :top Left:left Btom:bottom
Rght:right Rds :radius Amnt:amount Angl:angle Dstn:distance Thsh:threshold By  :by Wdth:width Cntr:center
Rltv:relative CnsP:constrainProportions Intr:interpolation Axis:axis Ornt:orientation As  :as In  :in Cpy :copy
Lctn:location Mdl :middle Cntn:continue Msge:message Fthr:feather AntA:antiAlias PrsT:preserveTransparency
Rd  :red Grn :green Bl  :blue Blck:black Wht :white Gry :gray FrgC:foregroundColor BckC:backgroundColor
fsel:selection WrPt:workPath Clss:class Idnt:ID ItmI:itemIndex Cnt :count Lvl :level Lvls:levels
Brgh:brightness Cntr:contrast Usrs:userMaskEnabled LyrI:layerID Grup:group Inpt:input Otpt:output
Nrml:normal Dslv:dissolve Drkn:darken Mltp:multiply CBrn:colorBurn Lghn:lighten Scrn:screen CDdg:colorDodge
Ovrl:overlay SftL:softLight HrdL:hardLight Dfrn:difference Xclu:exclusion H   :hue Strt:saturation Lmns:luminosity
#Pxl:pixelsUnit #Prc:percentUnit #Ang:angleUnit #Rlt:distanceUnit #Rsl:densityUnit #Pnt:pointsUnit #Mlm:millimetersUnit #Nne:noneUnit
JPEG:JPEG PNGF:PNGFormat Pht3:photoshop35Format EQlt:extendedQuality FlCn:fileCreator PGIT:PNGInterlaceType
PGIN:PNGInterlaceNone PNGf:PNGFilter PGAd:PNGFilterAdaptive Fl  :fill Nose:noise Dstr:distribution Unfr:uniformDistribution
Gsn :gaussianDistribution Mnch:monochromatic FlRs:randomSeed ClSz:cellSize SphM:spherizeMode HrzO:horizontalOnly
VrtO:verticalOnly Cnvr:conversion RctP:rectToPolar PlrR:polarToRect RplS:rippleSize Sml :small Mdm :medium Lrg :large
Edg :edge CntE:contourEdge Lwr :lower Upr :upper Spn :spin Zm  :zoom Wrp :wrapAround FlMd:fillMode
Auto:auto AuCo:autoContrast trim:trim Trns:transparency
Ofst:offset Pts :points Anch:anchor Fwd :forward Bwd :backward Smoo:smooth SbpL:subpathListKey Clsp:closedSubpath
Pth :path ShpO:shapeOperation Xor :xor Add :add Sbtr:subtract
Txt :textKey TxLr:textLayer TxtS:textStyle Sz  :size FntN:fontName FntS:fontStyleName Algn:alignment
Fnt :font Clrs:colors Dcmn:document DocI:documentID
Vrsn:version Dthr:dither Dt  :date MkVs:makeVisible Shw :show Hd  :hide
`.replace(/\n/g, ' ').match(/.{4}:[A-Za-z0-9#]+/g).map(t => [t.slice(0, 4), t.slice(5)]);   



export const CHAR_TO_STR = new Map();
export const STR_TO_CHAR = new Map();
for (const [c, s] of PAIRS) {
  if (!CHAR_TO_STR.has(c)) CHAR_TO_STR.set(c, s);
  if (!STR_TO_CHAR.has(s)) STR_TO_CHAR.set(s, c);
}
CHAR_TO_STR.set('Rslt', 'resolution'); CHAR_TO_STR.set('Intr', 'interpolation');
STR_TO_CHAR.set('resolution', 'Rslt'); STR_TO_CHAR.set('result', 'Rslt'); STR_TO_CHAR.set('interpolation', 'Intr');


export const keyOfString = s => STR_TO_CHAR.get(s) || s;

export const stringOfKey = k => (k.length === 4 && CHAR_TO_STR.get(k)) || k;


const DYN = new Map(), DYN_REV = new Map();
let next = 0x7F000000;
export function charIDToTypeID(c) {
  c = String(c);
  if (c.length !== 4) throw new Error(`charIDToTypeID 要 4 个字符："${c}"`);
  return ((c.charCodeAt(0) << 24) | (c.charCodeAt(1) << 16) | (c.charCodeAt(2) << 8) | c.charCodeAt(3)) >>> 0;
}
export function stringIDToTypeID(s) {
  s = String(s);
  const c = STR_TO_CHAR.get(s); if (c) return charIDToTypeID(c);
  if (!DYN.has(s)) { DYN.set(s, next); DYN_REV.set(next, s); next++; }
  return DYN.get(s);
}

export function keyOfTypeID(id) {
  id = id >>> 0;
  if (DYN_REV.has(id)) return DYN_REV.get(id);
  return String.fromCharCode((id >>> 24) & 255, (id >>> 16) & 255, (id >>> 8) & 255, id & 255);
}
export const typeIDToCharID = id => { const k = keyOfTypeID(id); return k.length === 4 && !DYN_REV.has(id >>> 0) ? k : ''; };
export const typeIDToStringID = id => stringOfKey(keyOfTypeID(id));


export const TERMS_JSON = () => JSON.stringify(PAIRS.concat([['Rslt', 'resolution'], ['Intr', 'interpolation']]));

export default { CHAR_TO_STR, STR_TO_CHAR, keyOfString, stringOfKey, charIDToTypeID, stringIDToTypeID, keyOfTypeID, typeIDToCharID, typeIDToStringID, TERMS_JSON };
