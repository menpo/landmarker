import * as React from "react"
import { Toggle } from '../components/Toggle'
import { Slider } from '../components/Slider'
import { ColourPicker } from '../components/ColourPicker'

export interface ToolbarProps {
    isConnectivityOn: boolean
    isTextureOn: boolean
    isSnapOn: boolean
    isAutosaveOn: boolean
    textureToggleEnabled: boolean
    setConnectivity: (isOn: boolean) => void
    setTexture: (isOn: boolean) => void
    setSnap: (isOn: boolean) => void
    setAutosave: (isOn: boolean) => void
    landmarkSize: number
    setLandmarkSize: (size: number) => void
    connectionColour: string
    setConnectionColour: (colour, event) => void
    unselectedLandmarkColour: string
    setUnselectedLandmarkColour: (colour, event) => void
    selectedLandmarkColour: string
    setSelectedLandmarkColour: (colour, event) => void
}

export function Toolbar(props: ToolbarProps) {
    return (
        <div>
            <Toggle label="Autosave" checked={props.isAutosaveOn} onClick={props.setAutosave} />
            <Toggle label="Links" checked={props.isConnectivityOn} onClick={props.setConnectivity} />
            { props.textureToggleEnabled ? <Toggle label="Texture" checked={props.isTextureOn} onClick={props.setTexture} /> : null }
            <Toggle label="Snap" checked={props.isSnapOn} onClick={props.setSnap} />
            <Slider label="●" min={0} max={100} value={props.landmarkSize} onChange={props.setLandmarkSize} />
            <ColourPicker label="Connection Colour" colour={props.connectionColour} setColour={props.setConnectionColour} />
            <ColourPicker label="Unselected Landmark Colour" colour={props.unselectedLandmarkColour} setColour={props.setUnselectedLandmarkColour} />
            <ColourPicker label="Selected Landmark Colour" colour={props.selectedLandmarkColour} setColour={props.setSelectedLandmarkColour} />
        </div>
    )
}
