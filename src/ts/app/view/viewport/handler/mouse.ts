import * as THREE from 'three'
import { Landmark, Intersection } from '../base'
import { Viewport } from '../index'
import { listenOnce } from '../lib/event'
import { findClosestLandmarks } from './base'

enum Handle {
    TL, // top left
    TR, // top right
    BL, // bottom left
    BR // bottom right
}

/**
 * Holds state usable by all event handlers and should be bound to the
 * Viewport view instance.
 */
export class MouseHandler {

    viewport: Viewport
    _currentTargetLmIndex: number = null

    downEvent: MouseEvent = null
    lmPressed: Landmark = null
    isPressed = false

    onMouseDownPosition = new THREE.Vector2()
    onMouseUpPosition = new THREE.Vector2()
    positionLmDrag =  new THREE.Vector2()

    dragStartPositions = []
    dragged = false
    intersectsWithLms: Intersection[] = []
    intersectsWithMesh: Intersection[] = []

    handlePressed: Handle

    readonly RESIZE_HANDLE_PADDING = 1
    readonly ROTATION_HANDLE_PADDING = 2

    constructor(viewport: Viewport) {
        this.viewport = viewport
    }

    get currentTargetLm (): Landmark {
      return this._currentTargetLmIndex !== null ?
          this.viewport.landmarks[this._currentTargetLmIndex] :
          null
    }

    set currentTargetLm (targetLm: Landmark) {
        if (targetLm === null) {
            this._currentTargetLmIndex = null
        } else {
            this._currentTargetLmIndex = targetLm.index
        }
    }

    // Helper functions

    boxIntersection = (mousePosition: THREE.Vector2, boxCentre : THREE.Vector2, radius: number) => {
        return mousePosition.x <= boxCentre.x + radius &&
            mousePosition.x >= boxCentre.x - radius &&
            mousePosition.y <= boxCentre.y + radius &&
            mousePosition.y >= boxCentre.y - radius
    }

    circleIntersection = (mousePosition: THREE.Vector2, circleCentre: THREE.Vector2, radius: number) => {
        const deltaX = (mousePosition.x - circleCentre.x)
        const deltaY = (mousePosition.y - circleCentre.y)
        return Math.sqrt((deltaX * deltaX) + (deltaY * deltaY)) <= radius
    }

    // Returns an array of [Landmark, number] where the second element is the original index of the Landmark
    sortByPosition = (lms: Landmark[]) => {
        const lToS = this.viewport.scene.localToScreen
        const compareByY = ((lm1, lm2) => {
            if (this.viewport.scene.localToScreen(lm1[0].point).y < this.viewport.scene.localToScreen(lm2[0].point).y) {
                return -1
            } else if (this.viewport.scene.localToScreen(lm1[0].point).y > this.viewport.scene.localToScreen(lm2[0].point).y) {
                return 1
            }
            return 0
        }).bind(this)
        const lmsClone = lms.slice(0)
        const result : (number | Landmark)[][] = []
        lmsClone.forEach((lm, i) => {
            result.push([lm, i])
        })
        result.sort(compareByY)
        var temp
        if (lToS((<Landmark>result[0][0]).point).x > lToS((<Landmark>result[1][0]).point).x) {
            temp = result[1]
            result[1] = result[0]
            result[0] = temp
        }
        if (lToS((<Landmark>result[2][0]).point).x > lToS((<Landmark>result[3][0]).point).x) {
            temp = result[3]
            result[3] = result[2]
            result[2] = temp
        }
        return result
    }

    // High level handlers
    // these functions respond to changes in the mesh and landamrks state.
    // lower level handlers below reponding to raw input (e.g. onMouseDown) will
    // resolve what item is being interacted with and delegate to these methods
    // as appropriate.
    // ------------------------------------------------------------------------

    meshPressed = () => {
        console.log('mesh pressed!')
        if (this.viewport.groupModeActive) {
            this.nothingPressed()
        } else if (this.downEvent.button === 0 && this.downEvent.shiftKey) {
            this.shiftPressed()  // LMB + SHIFT
        } else {
            listenOnce(document, 'mouseup', this.meshOnMouseUp)
        }
    }

    // called when the landmarks are changed on the viewport.
    resetLandmarks = () => {
        this.currentTargetLm = null
    }

    landmarkPressed = () => {
        var ctrl = this.downEvent.ctrlKey || this.downEvent.metaKey
        console.log('Viewport: landmark pressed')
        // before anything else, disable the camera
        this.viewport.cameraIsLocked = true
        // the clicked on landmark
        var landmarkSymbol = this.intersectsWithLms[0].object
        // hunt through the landmarkViews for the right symbol
        console.log(landmarkSymbol)

        this.viewport.scene.landmarkViews
            .filter(lmv => lmv.symbol === landmarkSymbol)
            .forEach(lmv => this.lmPressed = this.viewport.landmarks[lmv.index])
        console.log('Viewport: finding the selected points')

        if (!this.lmPressed.isSelected && !ctrl) {
            // this lm wasn't pressed before and we aren't holding
            // mutliselection down - deselect rest and select this
            console.log("normal click on a unselected lm - deselecting rest and selecting me")
            this.viewport.on.selectLandmarkAndDeselectRest(this.lmPressed.index)
        } else if (ctrl && !this.lmPressed.isSelected) {
            this.viewport.on.selectLandmarks([this.lmPressed.index])
        }

        // record the position of where the drag started.
        this.positionLmDrag.copy(this.viewport.scene.localToScreen(this.lmPressed.point))
        this.dragStartPositions = this.viewport.selectedLandmarks
            .map(lm => [lm.index, lm.point.clone()])

        // start listening for dragging landmarks
        document.addEventListener('mousemove', this.landmarkOrSelectionBoxOnDrag)
        listenOnce(document, 'mouseup', this.landmarkOnMouseUp)
    }

    nothingPressed = () => {
        console.log('nothing pressed!')
        listenOnce(document, 'mouseup', this.nothingOnMouseUp)
    }

    shiftPressed = () => {
        console.log('shift pressed!')
        // before anything else, disable the camera
        this.viewport.cameraIsLocked = true

        if (!(this.downEvent.ctrlKey || this.downEvent.metaKey)) {
            this.viewport.on.deselectAllLandmarks()
        }
        document.addEventListener('mousemove', this.shiftOnDrag)
        listenOnce(document, 'mouseup', this.shiftOnMouseUp)
    }

    resizeHandlePressed = () => {
        console.log('resize handle pressed!')
        // before anything else, disable the camera
        this.viewport.cameraIsLocked = true

        // record the starting positions of selected landmarks
        this.dragStartPositions = this.viewport.selectedLandmarks
            .map(lm => [lm.index, lm.point.clone()])

        // start listening for dragging selection handle
        document.addEventListener('mousemove', this.resizeHandleOnDrag)
        listenOnce(document, 'mouseup', this.resizeHandleOnMouseUp)
    }

    selectionBoxPressed = (event: MouseEvent) => {
        console.log('selection box pressed!')
        // before anything else, disable the camera
        this.viewport.cameraIsLocked = true

        // record the starting positions of selected landmarks
        this.positionLmDrag.copy(new THREE.Vector2(event.clientX, event.clientY))
        this.dragStartPositions = this.viewport.selectedLandmarks
            .map(lm => [lm.index, lm.point.clone()])

        // start listening for dragging selection box
        document.addEventListener('mousemove', this.landmarkOrSelectionBoxOnDrag)
        listenOnce(document, 'mouseup', this.selectionBoxOnMouseUp)
    }

    rotationHandlePressed = () => {
        console.log('rotation handle pressed!')
        // before anything else, disable the camera
        this.viewport.cameraIsLocked = true
        this.viewport.activateRotationCircle()

        this.viewport.clearCanvas()
        this.viewport.drawRotationCircle()

        // record the starting positions of selected landmarks
        this.dragStartPositions = this.viewport.selectedLandmarks
            .map(lm => [lm.index, lm.point.clone()])

        // start listening for dragging rotation handle
        document.addEventListener('mousemove', this.rotationHandleOnDrag)
        listenOnce(document, 'mouseup', this.rotationHandleOnMouseUp)
    }

    boundingBoxHandlePressed = () => {
        console.log('bounding box handle pressed!')
        // before anything else, disable the camera
        this.viewport.cameraIsLocked = true

        // record the starting positions of selected landmarks
        this.dragStartPositions = this.viewport.landmarks
            .map(lm => [lm.index, lm.point.clone()])

        // start listening for dragging bounding box handle
        document.addEventListener('mousemove', this.boundingBoxHandleOnDrag)
        listenOnce(document, 'mouseup', this.boundingBoxHandleOnMouseUp)
    }

    boundingBoxCreationStarted = () => {
        console.log('right click pressed in bounding box mode!')
        // before anything else, disable the camera
        this.viewport.cameraIsLocked = true

        document.addEventListener('mousemove', this.boundingBoxCreationOnDrag)
        listenOnce(document, 'mouseup', this.boundingBoxCreationOnMouseUp)
    }

    mouseDownOnResizeHandle = (resizedBox, handleRadius) => {
        const md = this.onMouseDownPosition
        // add extra padding to make handle easier to grab
        const hr = handleRadius + this.RESIZE_HANDLE_PADDING
        if (resizedBox.minPosition.x === -1 && resizedBox.minPosition.y === -1 && resizedBox.maxPosition.x === -1 && resizedBox.maxPosition.y === -1) {
            console.log("selection box inactive!")
            return false
        }
        if (this.boxIntersection(md, resizedBox.minPosition, hr)) {
            this.handlePressed = Handle.TL
            return true
        } else if (this.boxIntersection(md, resizedBox.maxPosition, hr)) {
            this.handlePressed = Handle.BR
            return true
        } else if (this.boxIntersection(md, new THREE.Vector2(resizedBox.minPosition.x, resizedBox.maxPosition.y), hr)) {
            this.handlePressed = Handle.BL
            return true
        } else if (this.boxIntersection(md, new THREE.Vector2(resizedBox.maxPosition.x, resizedBox.minPosition.y), hr)) {
            this.handlePressed = Handle.TR
            return true
        }
        return false
    }

    mouseDownOnSelectionBox = () => {
        const md = this.onMouseDownPosition
        const sb = this.viewport.selectionBox
        const hr = sb.handleRadius + this.RESIZE_HANDLE_PADDING
        if (sb.minPosition.x === -1 && sb.minPosition.y === -1 && sb.maxPosition.x === -1 && sb.maxPosition.y === -1) {
            console.log("selection box inactive!")
            return false
        }
        return md.x <= sb.maxPosition.x && md.x >= sb.minPosition.x && md.y <= sb.maxPosition.y && md.y >= sb.minPosition.y
        && !this.boxIntersection(md, sb.minPosition, hr) && !this.boxIntersection(md, sb.maxPosition, hr)
        && !this.boxIntersection(md, new THREE.Vector2(sb.minPosition.x, sb.maxPosition.y), hr)
        && !this.boxIntersection(md, new THREE.Vector2(sb.maxPosition.x, sb.minPosition.y), hr)
    }

    mouseDownOnRotationHandle = () => {
        const md = this.onMouseDownPosition
        const sb = this.viewport.selectionBox
        // add extra padding to make handle easier to grab
        const hr = sb.handleRadius + this.ROTATION_HANDLE_PADDING
        if (sb.minPosition.x === -1 && sb.minPosition.y === -1 && sb.maxPosition.x === -1 && sb.maxPosition.y === -1) {
            console.log("selection box inactive!")
            return false
        }
        const handleCentre = new THREE.Vector2((sb.minPosition.x + sb.maxPosition.x) / 2, sb.minPosition.y - (sb.handleRadius * 3))
        return this.circleIntersection(md, handleCentre, hr)
    }

    // Catch all clicks and delegate to other handlers once user's intent
    // has been figured out
    onMouseDown = (event: MouseEvent) => {
        event.preventDefault()
        this.viewport.focus()

        if (!this.viewport.hasLandmarks) {
            return
        }

        this.isPressed = true

        this.downEvent = event
        this.onMouseDownPosition.set(event.clientX, event.clientY)

        // All interactions require intersections to distinguish
        this.intersectsWithLms = this.viewport.scene.getIntersectsFromEvent(
            event, this.viewport.scene.sLms)
        // note that we explicitly ask for intersects with the mesh
        // object as we know get intersects will use an octree if
        // present.
        this.intersectsWithMesh = this.viewport.scene.getIntersectsFromEvent(event, this.viewport.scene.mesh)

        const mouseDownOnResizeHandle = this.mouseDownOnResizeHandle(this.viewport.selectionBox, this.viewport.selectionBox.handleRadius)
        const mouseDownOnSelectionBox = this.mouseDownOnSelectionBox()
        const mouseDownOnRotationHandle = this.mouseDownOnRotationHandle()
        const mouseDownOnBoundingBoxHandle = this.viewport.boundingBoxOn
            && this.mouseDownOnResizeHandle(this.viewport.boundingBox, this.viewport.boundingBox.handleHalfWidth)

        // Click type, we use MouseEvent.button which is the vanilla JS way
        // jQuery also exposes event.which which has different bindings
        if (event.button === 0) {  // left mouse button
            if (this.intersectsWithLms.length > 0 &&
                this.intersectsWithMesh.length > 0) {
                // degenerate case - which is closer?
                // selection handle takes precedence over landmark
                if (this.intersectsWithLms[0].distance < this.intersectsWithMesh[0].distance
                && !(mouseDownOnResizeHandle || mouseDownOnRotationHandle || mouseDownOnBoundingBoxHandle)) {
                    this.landmarkPressed()
                } else {
                    // the mesh was pressed. Check for selection handle first and shift second.
                    if (mouseDownOnBoundingBoxHandle) {
                        this.boundingBoxHandlePressed()
                    } else if (mouseDownOnResizeHandle) {
                        this.resizeHandlePressed()
                    } else if (mouseDownOnSelectionBox) {
                        this.selectionBoxPressed(event)
                    } else if (mouseDownOnRotationHandle) {
                        this.rotationHandlePressed()
                    } else if (event.shiftKey && !this.viewport.boundingBoxOn) {
                        this.shiftPressed()
                    } else if (this.viewport.snapModeEnabled && this.currentTargetLm !== null) {
                        this.meshPressed()
                    } else {
                        this.nothingPressed()
                    }
                }
            } else if (mouseDownOnBoundingBoxHandle) {
                this.boundingBoxHandlePressed()
            } else if (mouseDownOnResizeHandle) {
                this.resizeHandlePressed()
            } else if (mouseDownOnRotationHandle) {
                this.rotationHandlePressed()
            } else if (this.intersectsWithLms.length > 0) {
                this.landmarkPressed()
            } else if (mouseDownOnSelectionBox) {
                this.selectionBoxPressed(event)
            } else if (event.shiftKey && !this.viewport.boundingBoxOn) {
                this.shiftPressed()
            } else if (
                this.intersectsWithMesh.length > 0 &&
                this.viewport.snapModeEnabled
            ) {
                this.meshPressed()
            } else {
                this.nothingPressed()
            }
        } else if (event.button === 2) { // Right click
            if (
                this.intersectsWithLms.length <= 0 &&
                this.intersectsWithMesh.length > 0
            ) {
                this.viewport.on.deselectAllLandmarks()
                this.currentTargetLm = null
                if (this.viewport.boundingBoxOn) {
                    if (this.viewport.landmarks[0].point === null) {
                        this.boundingBoxCreationStarted()
                    } else {
                        this.nothingPressed()
                    }
                } else {
                    this.meshPressed()
                }
            }
        }
        this.viewport.requestUpdate()
    }

    // Drag Handlers
    // ------------------------------------------------------------------------
    landmarkOrSelectionBoxOnDrag = (event: MouseEvent) => {
        console.log("drag")
        // note that positionLmDrag is set to where we started.
        // update where we are now and where we were
        var newPositionLmDrag = new THREE.Vector2(
            event.clientX, event.clientY)
        var prevPositionLmDrag = this.positionLmDrag.clone()
        // change in this step in screen space

        // vector difference in one time step
        const deltaLmDrag = new THREE.Vector2()
        deltaLmDrag.subVectors(newPositionLmDrag, prevPositionLmDrag)
        // update the position
        this.positionLmDrag.copy(newPositionLmDrag)
        this.viewport.selectedLandmarks.forEach(lm => {
            // convert to screen coordinates
            const vScreen = this.viewport.scene.localToScreen(lm.point)

            // budge the screen coordinate
            vScreen.add(deltaLmDrag)

            this.moveLandmarksWithoutHistory(lm, vScreen.x, vScreen.y)
        })
        this.viewport.requestUpdate()
    }

    shiftOnDrag = (event: MouseEvent) => {
        console.log("shift:drag")
        // note - we use client as we don't want to jump back to zero
        // if user drags into sidebar!
        var newPosition = new THREE.Vector2(event.clientX, event.clientY)
        // clear the canvas and draw a selection rect.
        this.viewport.clearCanvas()
        this.viewport.canvas.drawBox(this.onMouseDownPosition, newPosition, "rgb(1, 230, 251)", "rgba(0, 0, 0, 0)")
    }

    resizeHandleOnDrag = (event: MouseEvent) => {
        console.log("selection handle:drag")
        const p = this.viewport.selectionBox.padding
        const oldMin = this.viewport.selectionBox.minPosition.clone().add(new THREE.Vector2(p, p))
        const oldMax = this.viewport.selectionBox.maxPosition.clone().sub(new THREE.Vector2(p, p))
        const newMin = oldMin.clone()
        const newMax = oldMax.clone()
        if (this.handlePressed === Handle.TL) {
            newMin.set(event.clientX + p, event.clientY + p)
        } else if (this.handlePressed === Handle.BR) {
            newMax.set(event.clientX - p, event.clientY - p)
        } else if (this.handlePressed === Handle.TR) {
            newMin.y = event.clientY + p
            newMax.x = event.clientX - p
        } else {
            newMin.x = event.clientX + p
            newMax.y = event.clientY - p
        }
        this.viewport.selectedLandmarks.forEach(lm => {
            // convert to screen coordinates
            const oldLmPos = this.viewport.scene.localToScreen(lm.point)

            // Calculate new coordinates based on new selection box
            const deltaX = (oldLmPos.x - oldMin.x) / (oldMax.x - oldMin.x)
            const deltaY = (oldLmPos.y - oldMin.y) / (oldMax.y - oldMin.y)
            const newLmX = (deltaX * (newMax.x - newMin.x)) + newMin.x
            const newLmY = (deltaY * (newMax.y - newMin.y)) + newMin.y

            this.moveLandmarksWithoutHistory(lm, newLmX, newLmY)
        })
        this.viewport.requestUpdate()
    }

    rotationHandleOnDrag = (event: MouseEvent) => {
        console.log("rotation handle:drag")
        const min = this.viewport.selectionBox.minPosition
        const max = this.viewport.selectionBox.maxPosition
        const deltaX = event.clientX - ((min.x + max.x) / 2)
        const deltaY = ((min.y + max.y) / 2) - event.clientY // since the 'up' Y-direction is negative
        const hyp = Math.sqrt((deltaX * deltaX) + (deltaY * deltaY))
        const sinTheta = deltaX / hyp
        const cosTheta = deltaY / hyp

        this.viewport.selectedLandmarks.forEach((lm, i) => {
            // convert to screen coordinates
            const oldLmPos = this.viewport.scene.localToScreen(this.dragStartPositions[i][1])

            const oldLmDeltaX = oldLmPos.x - ((min.x + max.x) / 2)
            const oldLmDeltaY = oldLmPos.y - ((min.y + max.y) / 2)
            const newLmX = (oldLmDeltaX * cosTheta) - (oldLmDeltaY * sinTheta) + ((min.x + max.x) / 2)
            const newLmY = (oldLmDeltaX * sinTheta) + (oldLmDeltaY * cosTheta) + ((min.y + max.y) / 2)

            this.moveLandmarksWithoutHistory(lm, newLmX, newLmY)
        })
        this.viewport.requestUpdateAndRefreshCanvas() // refresh - some movement may not budge landmarks
    }

    boundingBoxHandleOnDrag = (event: MouseEvent) => {
        console.log("bounding box handle:drag")
        const sortedLms: (Landmark | number)[][] = this.sortByPosition(this.viewport.landmarks)
        const lmTopLeft = this.viewport.landmarks[<number>sortedLms[0][1]]
        const lmTopRight = this.viewport.landmarks[<number>sortedLms[1][1]]
        const lmBottomLeft = this.viewport.landmarks[<number>sortedLms[2][1]]
        const lmBottomRight = this.viewport.landmarks[<number>sortedLms[3][1]]
        const lmTopLeftScreenPoint = this.viewport.scene.localToScreen(lmTopLeft.point)
        const lmTopRightScreenPoint = this.viewport.scene.localToScreen(lmTopRight.point)
        const lmBottomLeftScreenPoint = this.viewport.scene.localToScreen(lmBottomLeft.point)
        const lmBottomRightScreenPoint = this.viewport.scene.localToScreen(lmBottomRight.point)
        const newX = event.clientX
        const newY = event.clientY

        if (this.handlePressed === Handle.TL) {
            this.moveLandmarksWithoutHistory(lmTopLeft, newX, newY)
            this.moveLandmarksWithoutHistory(lmTopRight, lmTopRightScreenPoint.x, newY)
            this.moveLandmarksWithoutHistory(lmBottomLeft, newX, lmBottomLeftScreenPoint.y)
        } else if (this.handlePressed === Handle.BR) {
            this.moveLandmarksWithoutHistory(lmBottomRight, newX, newY)
            this.moveLandmarksWithoutHistory(lmTopRight, newX, lmTopRightScreenPoint.y)
            this.moveLandmarksWithoutHistory(lmBottomLeft, lmBottomLeftScreenPoint.x, newY)
        } else if (this.handlePressed === Handle.TR) {
            this.moveLandmarksWithoutHistory(lmTopRight, newX, newY)
            this.moveLandmarksWithoutHistory(lmTopLeft, lmTopLeftScreenPoint.x, newY)
            this.moveLandmarksWithoutHistory(lmBottomRight, newX, lmBottomRightScreenPoint.y)
        } else {
            this.moveLandmarksWithoutHistory(lmBottomLeft, newX, newY)
            this.moveLandmarksWithoutHistory(lmTopLeft, newX, lmTopLeftScreenPoint.y)
            this.moveLandmarksWithoutHistory(lmBottomRight, lmBottomRightScreenPoint.x, newY)
        }
        this.viewport.requestUpdate()
    }

    boundingBoxCreationOnDrag = (event: MouseEvent) => {
        console.log("bounding box creation:drag")
        // note - we use client as we don't want to jump back to zero
        // if user drags into sidebar!
        var newPosition = new THREE.Vector2(event.clientX, event.clientY)
        // clear the canvas and draw a bounding box rect.
        this.viewport.clearCanvas()
        this.viewport.canvas.drawBox(this.onMouseDownPosition, newPosition, "rgb(153, 0, 239)", "rgba(0, 0, 0, 0)")
    }

    moveLandmarksWithoutHistory = (lm: Landmark, newLmX: number, newLmY: number) => {
        // use the standard machinery to find intersections
        // note that we intersect the mesh to use the octree
        this.intersectsWithMesh = this.viewport.scene.getIntersects(
            newLmX, newLmY, this.viewport.scene.mesh)
        if (this.intersectsWithMesh.length > 0) {
            // good, we're still on the mesh.
            this.dragged = !!this.dragged || true
            this.viewport.on.setLandmarkPointWithoutHistory(lm.index,
                this.viewport.scene.worldToLocal(this.intersectsWithMesh[0].point))
        } else {
            // don't update point - it would fall off the surface.
            console.log("fallen off mesh")
        }
    }

    // Up handlers
    // ------------------------------------------------------------------------

    shiftOnMouseUp = (event: MouseEvent) => {
        this.viewport.cameraIsLocked = false
        console.log("shift:up")
        document.removeEventListener('mousemove', this.shiftOnDrag)
        var x1 = this.onMouseDownPosition.x
        var y1 = this.onMouseDownPosition.y
        var x2 = event.clientX
        var y2 = event.clientY
        let minX: number, maxX: number, minY: number, maxY: number
        if (x1 < x2) {
            [minX, maxX] = [x1, x2]
        } else {
            [minX, maxX] = [x2, x1]
        }
        if (y1 < y2) {
            [minY, maxY] = [y1, y2]
        } else {
            [minY, maxY] = [y2, y1]
        }
        // First, let's just find all the landmarks in screen space that
        // are within our selection.
        var lms = this.viewport.scene.lmViewsInSelectionBox(minX, minY, maxX, maxY)

        // Of these, filter out the ones which are visible (not
        // obscured) and select the rest
        const indexesToSelect = lms.filter(this.viewport.scene.lmViewVisible).map(lm => lm.index)
        this.viewport.on.selectLandmarks(indexesToSelect)
        this.viewport.requestUpdateAndRefreshCanvas()
        this.isPressed = false
    }

    meshOnMouseUp = (event: MouseEvent) => {
        console.log("meshPress:up")
        this.onMouseUpPosition.set(event.clientX, event.clientY)
        if (this.onMouseDownPosition.distanceTo(this.onMouseUpPosition) < 2) {
            //  a click on the mesh
            // Convert the point back into the mesh space
            const p = this.viewport.scene.worldToLocal(this.intersectsWithMesh[0].point)
            if (
                this.viewport.snapModeEnabled &&
                this.currentTargetLm !== null &&
                this.currentTargetLm.point !== null
            ) {
                // we are in edit mode - adjust the target point
                this.viewport.on.setLandmarkPoint(this.currentTargetLm.index, p)
            } else if (this.downEvent.button === 2) {
                // right click - insert point.
                this.viewport.on.insertNewLandmark(p)
            }
        }
        this.isPressed = false
        this.viewport.clearCanvas()
    }

    nothingOnMouseUp = (event: MouseEvent) => {
        console.log("nothingPress:up")
        this.onMouseUpPosition.set(event.clientX, event.clientY)
        if (this.onMouseDownPosition.distanceTo(this.onMouseUpPosition) < 2) {
            // a click on nothing - deselect all
            this.viewport.on.deselectAllLandmarks()
        }
        this.isPressed = false
        this.viewport.clearCanvas()
        this.viewport.updateAndDrawSelectionBox()
        this.viewport.updateAndDrawBoundingBox()
    }

    landmarkOnMouseUp = (event: MouseEvent) => {
        const ctrl = this.downEvent.ctrlKey || this.downEvent.metaKey
        this.viewport.cameraIsLocked = false
        console.log("landmarkPress:up")
        document.removeEventListener('mousemove', this.landmarkOrSelectionBoxOnDrag)
        this.onMouseUpPosition.set(event.clientX, event.clientY)

        if (this.onMouseDownPosition.distanceTo(this.onMouseUpPosition) === 0) {
            // landmark was pressed
            if (this.lmPressed.isSelected && ctrl) {
                this.viewport.on.deselectLandmarks([this.lmPressed.index])
            } else if (!ctrl && !this.lmPressed.isSelected) {
                this.viewport.on.selectLandmarkAndDeselectRest(this.lmPressed.index)
            } else if (this.lmPressed.isSelected) {
                const p = this.viewport.scene.worldToLocal(this.intersectsWithMesh[0].point)
                this.viewport.on.setLandmarkPoint(this.lmPressed.index, p)
            }
        } else if (this.dragged) {
            this.viewport.selectedLandmarks.forEach((lm, i) => {
                this.dragStartPositions[i].push(lm.point.clone())
            })
            this.viewport.on.addLandmarkHistory(this.dragStartPositions)
        }

        this.viewport.requestUpdateAndRefreshCanvas()
        this.dragged = false
        this.dragStartPositions = []
        this.isPressed = false
    }

    resizeHandleOnMouseUp = () => {
        this.viewport.cameraIsLocked = false
        console.log("resizeHandlePress:up")
        document.removeEventListener('mousemove', this.resizeHandleOnDrag)
        this.mouseUpUpdate(false)
    }

    selectionBoxOnMouseUp = () => {
        this.viewport.cameraIsLocked = false
        console.log("selectionBoxPress:up")
        document.removeEventListener('mousemove', this.landmarkOrSelectionBoxOnDrag)
        this.mouseUpUpdate(false)
    }

    rotationHandleOnMouseUp = () => {
        this.viewport.cameraIsLocked = false
        console.log("rotationHandlePress:up")
        document.removeEventListener('mousemove', this.rotationHandleOnDrag)
        this.viewport.deactivateRotationCircle()
        this.mouseUpUpdate(false)
    }

    boundingBoxHandleOnMouseUp = () => {
        this.viewport.cameraIsLocked = false
        console.log("boundingBoxHandlePress:up")
        document.removeEventListener('mousemove', this.boundingBoxHandleOnDrag)
        this.mouseUpUpdate(true)
    }

    boundingBoxCreationOnMouseUp = (event: MouseEvent) => {
        this.viewport.cameraIsLocked = false
        console.log("boundingBoxCreation:up")
        document.removeEventListener('mousemove', this.boundingBoxCreationOnDrag)
        var x1 = this.onMouseDownPosition.x
        var y1 = this.onMouseDownPosition.y
        var x2 = event.clientX
        var y2 = event.clientY
        let minX: number, maxX: number, minY: number, maxY: number
        if (x1 < x2) {
            [minX, maxX] = [x1, x2]
        } else {
            [minX, maxX] = [x2, x1]
        }
        if (y1 < y2) {
            [minY, maxY] = [y1, y2]
        } else {
            [minY, maxY] = [y2, y1]
        }
        this.moveLandmarksWithoutHistory(this.viewport.landmarks[0], minX, minY)
        this.moveLandmarksWithoutHistory(this.viewport.landmarks[1], maxX, minY)
        this.moveLandmarksWithoutHistory(this.viewport.landmarks[2], minX, maxY)
        this.moveLandmarksWithoutHistory(this.viewport.landmarks[3], maxX, maxY)
        this.dragStartPositions = [null, null, null, null]
        this.viewport.landmarks.forEach((lm, i) => {
            this.dragStartPositions[i] = [lm.index, null]
            this.dragStartPositions[i].push(lm.point.clone())
        })
        this.viewport.on.addLandmarkHistory(this.dragStartPositions)

        this.dragged = false
        this.dragStartPositions = []
        this.viewport.requestUpdateAndRefreshCanvas()
        this.isPressed = false
    }

    mouseUpUpdate = (boundingBox: boolean) => {
        if (this.dragged) {
            this.viewport.selectedLandmarks.forEach((lm, i) => {
                this.dragStartPositions[i].push(lm.point.clone())
            })
            this.viewport.on.addLandmarkHistory(this.dragStartPositions)
        }
        if (boundingBox) {
            this.viewport.landmarks.forEach((lm, i) => {
                this.dragStartPositions[i].push(lm.point.clone())
            })
            this.viewport.on.addLandmarkHistory(this.dragStartPositions)
        }

        this.viewport.requestUpdateAndRefreshCanvas()
        this.dragged = false
        this.dragStartPositions = []
        this.isPressed = false
    }

    // Move handlers
    // ------------------------------------------------------------------------
    onMouseMove = (event: MouseEvent) => {

        this.viewport.clearCanvas()

        if (this.isPressed) {
            return
        }

        // update and draw selection and bounding boxes if active
        this.viewport.updateAndDrawSelectionBox()
        this.viewport.updateAndDrawBoundingBox()

        if (!this.viewport.landmarkSnapPermitted) {
            return
        }

        // only here as:
        // 1. Edit mode is enabled
        // 2. No group selection is made
        // 3. There is at least one landmark

        if (this.currentTargetLm !== null && this.currentTargetLm.point === null)
        {
            // the target point has been deleted - reset it.
            this.currentTargetLm = null
        }

        this.intersectsWithMesh = this.viewport.scene.getIntersectsFromEvent(event, this.viewport.scene.mesh)

        if (this.intersectsWithMesh.length == 0) {
            // moving the mouse off the mesh does nothing.
            return
        }

        const mouseLoc = this.viewport.scene.worldToLocal(this.intersectsWithMesh[0].point)

        // lock only works once we have an existing target landmark
        const lockEnabled = (event.ctrlKey || event.metaKey) && this.currentTargetLm !== null

        let newTarget: Landmark, nextClosest: Landmark[] = []
        if (lockEnabled) {
            // we will not change the existing target
            newTarget = this.currentTargetLm

            // only pick from the remaining landmarks
            const candidateLandmarks = this.viewport.nonEmptyLandmarks
                .filter(lm => lm.index !== this.currentTargetLm.index)
            nextClosest = findClosestLandmarks(candidateLandmarks, mouseLoc, 3)

        } else {
            // need to chose a new target landmark and new next closest
            [newTarget, ...nextClosest] = findClosestLandmarks(this.viewport.nonEmptyLandmarks, mouseLoc, 4)
        }

        // Remember, we know there are >= 1 landmarks, so we always have a newTarget.
        // Draw it and the next closest on the UI....
        this.viewport.drawTargetingLines(new THREE.Vector2(event.clientX, event.clientY),
            newTarget, nextClosest)

        // and if we have a change of new target, update the selection
        if (!this.currentTargetLm !== null || newTarget.index !== this.currentTargetLm.index) {
            // target has changed, which triggers a change in selection
            this.viewport.on.selectLandmarkAndDeselectRest(newTarget.index)

            // finally, update the current target lm for next time around.
            this.currentTargetLm = newTarget
        }

        this.viewport.requestUpdate()
    }

}
