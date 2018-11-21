import CTBaseInterfaces = require("./Base/CanvasTools.Base.Interfaces");
import IBase = CTBaseInterfaces.CanvasTools.Base.Interfaces;
import CTBaseRect = require("./Base/CanvasTools.Base.Rect");
import Rect = CTBaseRect.CanvasTools.Base.Rect.Rect;
import CTBasePoint = require("./Base/CanvasTools.Base.Point2D");
import Point2D = CTBasePoint.CanvasTools.Base.Point.Point2D;

import * as Snap from "snapsvg";

export module CanvasTools.Selection {    
    
    abstract class ElementPrototype implements IBase.IHideable, IBase.IResizable {
        protected paper: Snap.Paper;
        protected boundRect: Rect;
        public node: Snap.Element;

        protected isVisible:boolean = true;

        constructor(paper:Snap.Paper, boundRect: Rect) {
            this.paper = paper;
            this.boundRect = boundRect;
        }

        public hide() {
            if (this.isVisible) {
                this.node.node.setAttribute("visibility", "hidden");
                this.isVisible = false;
            }
        }

        public show() {
            if (!this.isVisible) {
                this.node.node.setAttribute("visibility", "visible");
                this.isVisible = true;
            }
        }

        public resize(width: number, height: number) {
            this.boundRect.resize(width, height);
        }
    }


    class CrossElement extends ElementPrototype implements IBase.IPoint2D {
        private hl: Snap.Element;
        private vl: Snap.Element;
        public x: number;
        public y: number;

        constructor(paper: Snap.Paper, boundRect: Rect){
            super(paper, boundRect);
            this.buildUIElements();
        }

        private buildUIElements() {
            let verticalLine: Snap.Element = this.paper.line(0, 0, 0, this.boundRect.height);
            let horizontalLine: Snap.Element = this.paper.line(0, 0, this.boundRect.width, 0);

            this.node = this.paper.g();
            this.node.addClass("crossStyle");
            this.node.add(verticalLine);
            this.node.add(horizontalLine);

            this.hl = horizontalLine;
            this.vl = verticalLine;
            this.x = 0;
            this.y = 0;

            this.hide();
        }

        public boundToRect(rect: IBase.IRect): Point2D {
            return new Point2D(this.x, this.y).boundToRect(rect);
        }

        public move(p: IBase.IPoint2D, rect:IBase.IRect, square:boolean = false, ref: IBase.IPoint2D = null) {
            let np:Point2D = p.boundToRect(rect); 

            if (square) {
                let dx = Math.abs(np.x - ref.x);
                let vx = Math.sign(np.x - ref.x);
                let dy = Math.abs(np.y - ref.y);
                let vy = Math.sign(np.y - ref.y);

                let d = Math.min(dx, dy);
                np.x = ref.x + d * vx;
                np.y = ref.y + d * vy;
            }

            this.x = np.x;
            this.y = np.y;  
            
            this.vl.node.setAttribute("x1", np.x.toString());
            this.vl.node.setAttribute("x2", np.x.toString());
            this.vl.node.setAttribute("y2", rect.height.toString());

            this.hl.node.setAttribute("y1", np.y.toString());
            this.hl.node.setAttribute("x2", rect.width.toString());
            this.hl.node.setAttribute("y2", np.y.toString());
        }

        public resize(width: number, height: number) {
            super.resize(width, height);
            this.vl.node.setAttribute("y2", height.toString());
            this.hl.node.setAttribute("x2", width.toString());
        }
    }

    class RectElement extends ElementPrototype {
        public rect: Rect;

        constructor(paper: Snap.Paper, boundRect:Rect, rect: Rect){
            super(paper, boundRect);
            this.rect = rect;
            this.buildUIElements();
            this.hide();
        }

        private buildUIElements(){
            this.node = this.paper.rect(0, 0, this.rect.width, this.rect.height);
    
        }

        public move(p: IBase.IPoint2D) {           
            this.node.node.setAttribute("x", p.x.toString());
            this.node.node.setAttribute("y", p.y.toString());
        }

        public resize(width: number, height: number){
            this.rect.resize(width, height);
            this.node.node.setAttribute("height", height.toString());
            this.node.node.setAttribute("width", width.toString());
        }
    }

    class MaskElement extends ElementPrototype {
        private mask: RectElement;
        private maskIn: RectElement;        
        private maskOut: { node: Snap.Element };       

        constructor(paper:Snap.Paper, boundRect: Rect, maskOut: { node: Snap.Element }) {
            super(paper, boundRect);
            this.maskOut = maskOut;
            this.buildUIElements();
            this.resize(boundRect.width, boundRect.height);
        }

        private buildUIElements() {
            this.mask = this.createMask();

            this.maskIn = this.createMaskIn();
            this.maskOut.node.addClass("maskOutStyle");

            let combinedMask = this.paper.g();
                combinedMask.add(this.maskIn.node);
                combinedMask.add(this.maskOut.node);

            this.mask.node.attr({
                mask: combinedMask
            });

            this.node = this.mask.node;
            this.hide();
        }

        private createMask(): RectElement {
            let r:RectElement = new RectElement(this.paper, this.boundRect, this.boundRect);
            r.node.addClass("maskStyle");
            return r;
        }

        private createMaskIn(): RectElement {
            let r:RectElement = new RectElement(this.paper, this.boundRect, this.boundRect);            
            r.node.addClass("maskInStyle");
            return r;
        }
 
        public resize(width: number, height: number){
            super.resize(width, height);
            this.mask.resize(width, height);
            this.maskIn.resize(width, height);
        }
    }

    abstract class SelectorPrototype extends ElementPrototype {

        constructor(paper: Snap.Paper, boundRect: Rect) {
            super(paper, boundRect);
        }
    }

    export class RectSelector extends SelectorPrototype {
        constructor(paper: Snap.Paper, boundRect: Rect) {
            super(paper, boundRect);
        }
    }

    export class RectCopySelector extends SelectorPrototype{
        constructor(paper: Snap.Paper, boundRect: Rect) {
            super(paper, boundRect);
        }
    }


    export enum SelectionMode { RECT, TWOPOINTS, CENTRALPOINT };
    export enum SelectionModificator { RECT, SQUARE };

    export class AreaSelector {
        private baseParent:SVGSVGElement;
        private paper: Snap.Paper;
        private boundRect: Rect;

        private selectionBox: RectElement;
        private mask: MaskElement;

        private crossA: CrossElement;
        private crossB: CrossElement;
        private capturingState: boolean = false;
        private isLocked: boolean = false;
        private areaSelectorLayer: Snap.Element;
        private templateRect: RectElement;

        public onSelectionBeginCallback: Function;
        public onSelectionEndCallback: Function;
        public onLocked: Function;
        public onUnlocked: Function;

        private isEnabled: boolean = true;

        private selectionMode: SelectionMode = SelectionMode.RECT;
        private selectionModificator: SelectionModificator = SelectionModificator.RECT;

        private templateSize: Rect;
        public static DefaultTemplateSize: Rect = new Rect(20, 20);

        constructor(svgHost: SVGSVGElement, onSelectionBegin: Function, onSelectionEnd: Function){
            this.templateSize = AreaSelector.DefaultTemplateSize;

            this.buildUIElements(svgHost);
            this.subscribeToEvents();
            this.onSelectionEndCallback = onSelectionEnd;
            this.onSelectionBeginCallback = onSelectionBegin;
        }

        private buildUIElements(svgHost: SVGSVGElement) {
            this.baseParent = svgHost;
            this.paper = Snap(svgHost);
            this.boundRect = new Rect(svgHost.width.baseVal.value, svgHost.height.baseVal.value);

            this.areaSelectorLayer = this.paper.g();
            this.areaSelectorLayer.addClass("areaSelector");
            
            this.selectionBox = this.createSelectionBox();
            this.mask = this.createMask(this.selectionBox);

            this.crossA = this.createCross();
            this.crossB = this.createCross();

            this.templateRect = this.createTemplateRect();

            this.hideAll([this.crossA, this.crossB, this.templateRect, this.mask]);

            this.areaSelectorLayer.add(this.mask.node);
            this.areaSelectorLayer.add(this.crossA.node);
            this.areaSelectorLayer.add(this.crossB.node);
            this.areaSelectorLayer.add(this.templateRect.node);
        }

        private createSelectionBox(): RectElement {
            let r:RectElement = new RectElement(this.paper, this.boundRect, new Rect(0, 0));
            r.node.addClass("selectionBoxStyle");
            return r;
        }

        private createMask(selectionBox: RectElement): MaskElement
        {
            return new MaskElement(this.paper, this.boundRect, selectionBox);
        }

        private createCross(): CrossElement {
            let cr:CrossElement = new CrossElement(this.paper, this.boundRect);  
            return cr;
        }

        private createTemplateRect(): RectElement {
            let r: RectElement = new RectElement(this.paper, this.boundRect, this.templateSize);
            r.node.addClass("templateRectStyle");
            return r;
        }

        public resize(width:number, height:number):void {
            if (width !== undefined && height !== undefined) {
                this.boundRect.resize(width, height);
                this.baseParent.style.width = width.toString();
                this.baseParent.style.height = height.toString();
            } else {
                this.boundRect.resize(this.baseParent.width.baseVal.value, this.baseParent.height.baseVal.value);
            }

            this.resizeAll([this.mask, this.crossA, this.crossB]);
        }

        private resizeAll(elementSet: Array<IBase.IResizable>) {
            window.requestAnimationFrame(() => {
                elementSet.forEach(element => {
                    element.resize(this.boundRect.width, this.boundRect.height);                
                });
            })            
        }

        private showAll(elementSet: Array<IBase.IHideable>) {
            window.requestAnimationFrame(() => {
                elementSet.forEach(element => {
                    element.show();                
                });    
            })            
        }

        private hideAll(elementSet: Array<IBase.IHideable>) {
            window.requestAnimationFrame(() => {
                elementSet.forEach(element => {
                    element.hide();                
                }); 
            })            
        }

        private onPointerEnter(e:PointerEvent) {
            window.requestAnimationFrame(() => {
                this.crossA.show();

                if (this.selectionMode === SelectionMode.CENTRALPOINT) {
                    this.templateRect.show();
                }
            })            
        }

        private onPointerLeave(e:PointerEvent) {
            window.requestAnimationFrame(() => {
                let rect = this.baseParent.getClientRects();
                let p = new Point2D(e.clientX - rect[0].left, e.clientY - rect[0].top);

                if (this.selectionMode === SelectionMode.RECT && !this.capturingState) {
                    this.hideAll([this.crossA, this.crossB, this.selectionBox]);
                } else if (this.selectionMode === SelectionMode.TWOPOINTS && this.capturingState) {
                    this.moveCross(this.crossB, p);
                    this.moveSelectionBox(this.selectionBox, this.crossA, this.crossB);
                } else if (this.selectionMode === SelectionMode.CENTRALPOINT) {
                    this.hideAll([this.templateRect, this.crossA, this.crossB]);
                }
            });
            
        }

        private onPointerDown(e:PointerEvent) {
            window.requestAnimationFrame(() => {
                if (this.selectionMode === SelectionMode.RECT) {
                    this.capturingState = true;

                    this.baseParent.setPointerCapture(e.pointerId);
                    this.moveCross(this.crossB, this.crossA);
                    this.moveSelectionBox(this.selectionBox, this.crossA, this.crossB);

                    this.showAll([this.mask, this.crossB, this.selectionBox]);

                    if (typeof this.onSelectionBeginCallback === "function") {
                        this.onSelectionBeginCallback();
                    }
                } else if (this.selectionMode === SelectionMode.CENTRALPOINT) {
                    this.showAll([this.templateRect]);
                    this.moveTemplateRect(this.templateRect, this.crossA);
                    if (typeof this.onSelectionBeginCallback === "function") {
                        this.onSelectionBeginCallback();
                    }
                }
            });         
        }

        private onPointerUp(e:PointerEvent) {
            window.requestAnimationFrame(() => {
                let rect = this.baseParent.getClientRects();
                let p = new Point2D(e.clientX - rect[0].left, e.clientY - rect[0].top);
                
                if (this.selectionMode === SelectionMode.RECT) { 
                    this.capturingState = false;
                    this.baseParent.releasePointerCapture(e.pointerId);                    
                    this.hideAll([this.crossB, this.mask]);
                    
                    if (typeof this.onSelectionEndCallback === "function") {
                        this.onSelectionEndCallback(this.crossA.x, this.crossA.y, this.crossB.x, this.crossB.y);
                    }
                } 
                else if (this.selectionMode === SelectionMode.TWOPOINTS) {
                    if (this.capturingState) {
                        this.capturingState = false;
                        this.hideAll([this.crossB, this.mask]);

                        if (typeof this.onSelectionEndCallback === "function") {
                            this.onSelectionEndCallback(this.crossA.x, this.crossA.y, this.crossB.x, this.crossB.y);
                        }
                        this.moveCross(this.crossA, p);
                        this.moveCross(this.crossB, p);
                    } else {
                        this.capturingState = true;
                        this.moveCross(this.crossB, p);
                        this.moveSelectionBox(this.selectionBox, this.crossA, this.crossB);
                        this.showAll([this.crossA, this.crossB, this.selectionBox, this.mask]);

                        if (typeof this.onSelectionBeginCallback === "function") {
                            this.onSelectionBeginCallback();
                        }
                    }
                } else if (this.selectionMode === SelectionMode.CENTRALPOINT) {
                    if (typeof this.onSelectionEndCallback === "function") {
                        let p1 = new Point2D(this.crossA.x - this.templateSize.width/2, this.crossA.y - this.templateSize.height/2);
                        let p2 = new Point2D(this.crossA.x + this.templateSize.width/2, this.crossA.y + this.templateSize.height/2);
                        p1 = p1.boundToRect(this.boundRect);
                        p2 = p2.boundToRect(this.boundRect);
                        this.onSelectionEndCallback(p1.x, p1.y, p2.x, p2.y);
                    }
                }
            });
        }

        private onPointerMove(e:PointerEvent) {
            window.requestAnimationFrame(() => {
                let rect = this.baseParent.getClientRects();
                let p = new Point2D(e.clientX - rect[0].left, e.clientY - rect[0].top);

                this.crossA.show();

                if (this.selectionMode === SelectionMode.RECT) {
                    if (this.capturingState) {
                        this.moveCross(this.crossB, p, this.selectionModificator === SelectionModificator.SQUARE, this.crossA);                    
                        this.moveSelectionBox(this.selectionBox, this.crossA, this.crossB);
                    } else {
                        this.moveCross(this.crossA, p);
                    }
                } else if (this.selectionMode === SelectionMode.TWOPOINTS) {
                    if (this.capturingState) {
                        this.moveCross(this.crossB, p, this.selectionModificator === SelectionModificator.SQUARE, this.crossA);                    
                        this.moveSelectionBox(this.selectionBox, this.crossA, this.crossB);
                    } else {
                        this.moveCross(this.crossA, p);
                        this.moveCross(this.crossB, p);
                    }
                } else if (this.selectionMode === SelectionMode.CENTRALPOINT) {
                    this.templateRect.show();
                    this.moveCross(this.crossA, p);
                    this.moveTemplateRect(this.templateRect, this.crossA);
                }
            });

            e.preventDefault();
        }

        private onKeyDown(e:KeyboardEvent) {
            //Holding shift key enable square drawing mode
            if (e.shiftKey) {
                this.selectionModificator = SelectionModificator.SQUARE;
            } 

            if (this.selectionMode === SelectionMode.RECT || this.selectionMode === SelectionMode.TWOPOINTS) {
                if (e.ctrlKey && !this.capturingState) {
                    this.selectionMode = SelectionMode.TWOPOINTS;                   
                }
            } 
            // else if (this.selectionMode === SelectionMode.CENTRALPOINT) { }
        }

        private onKeyUp(e:KeyboardEvent) {
            //Holding shift key enable square drawing mode
            if (!e.shiftKey) {
                this.selectionModificator = SelectionModificator.RECT;
            }

            if (this.selectionMode === SelectionMode.RECT || this.selectionMode === SelectionMode.TWOPOINTS) {
                //Holding Ctrl key to enable two point selection mode
                if (!e.ctrlKey && this.selectionMode === SelectionMode.TWOPOINTS) {
                    this.selectionMode = SelectionMode.RECT;
                    this.capturingState = false;

                    this.moveCross(this.crossA, this.crossB);
                    this.hideAll([this.crossB, this.selectionBox, this.mask]);
                }
            }
            // else if (this.selectionMode === SelectionMode.CENTRALPOINT) { }


            // L key to lock/unlock selection to allow adding new regions on top of others
            if(e.code === 'KeyL') {
                this.toggleLockState();
            } 
            //Escape to exit exclusive mode
            if(e.keyCode == 27) {
                this.unlock();
            }
        }

        private subscribeToEvents() {
            let listeners = [
                {event: "pointerenter", listener: this.onPointerEnter, base: this.baseParent, bypass: false},
                {event: "pointerleave", listener: this.onPointerLeave, base: this.baseParent, bypass: false},
                {event: "pointerdown", listener: this.onPointerDown, base: this.baseParent, bypass: false},
                {event: "pointerup", listener: this.onPointerUp, base: this.baseParent, bypass: false},
                {event: "pointermove", listener: this.onPointerMove, base: this.baseParent, bypass: false},
                {event: "keydown", listener: this.onKeyDown, base: window, bypass: false},
                {event: "keyup", listener: this.onKeyUp, base: window, bypass: true},
            ];

            listeners.forEach(e => {
                e.base.addEventListener(e.event, this.enablify(e.listener.bind(this), e.bypass));            
            });
        }

        private toggleLockState() {
            if (this.isLocked) {
                this.unlock();
            } else {
                this.lock();
            }
        }

        public lock() {
            this.isLocked = true;
            this.enable();
            if (this.onLocked instanceof Function) {
                this.onLocked();
            }
        }

        public unlock() {
            this.isLocked = false;
            if (this.onUnlocked instanceof Function) {
                this.onUnlocked();
            }
        }

        private moveCross(cross:CrossElement, p:IBase.IPoint2D, square:boolean = false, refCross: CrossElement = null) {
            cross.move(p, this.boundRect, square, refCross);
        }        

        private moveSelectionBox(box: RectElement, crossA:CrossElement, crossB: CrossElement) {
            var x = (crossA.x < crossB.x) ? crossA.x : crossB.x;
            var y = (crossA.y < crossB.y) ? crossA.y : crossB.y;
            var w = Math.abs(crossA.x - crossB.x);
            var h = Math.abs(crossA.y - crossB.y);

            box.move(new Point2D(x, y));
            box.resize(w, h);
        }

        private moveTemplateRect(template: RectElement, crossA:CrossElement) {
            var x = crossA.x - template.rect.width/2;
            var y = crossA.y - template.rect.height/2;
            template.move(new Point2D(x, y));
        }

        public enable() {
            if (!this.isEnabled) {
                this.isEnabled = true;
                this.areaSelectorLayer.attr({
                    visibility: "visible"
                });
            }
        }

        public disable() {
            if(!this.isLocked && this.isEnabled) {
                this.isEnabled = false;

                this.hideAll([this.crossA, this.crossB, this.mask, this.templateRect]);
                this.areaSelectorLayer.attr({
                    visibility: "hidden"
                });
            }
        }

        public setSelectionMode(selectionMode: SelectionMode, options?: { template?: Rect }) {
            this.selectionMode = selectionMode;
            if (selectionMode === SelectionMode.CENTRALPOINT) {
                if (options !== undefined && options.template !== undefined) {
                    this.setTemplate(options.template);
                } else {
                    this.setTemplate(AreaSelector.DefaultTemplateSize);
                }
                this.hideAll([this.mask, this.selectionBox, this.crossB]);

            } else {
                this.templateRect.hide();
            }
        }

        private setTemplate(template: Rect) {
            this.templateSize = template;
            this.templateRect.resize(template.width, template.height);
        }

        private enablify(f:Function, bypass:boolean = false) {
            return (args:PointerEvent|KeyboardEvent) => {
                if (this.isEnabled || bypass) {
                    f(args);
                }
            }
        }
    }
}