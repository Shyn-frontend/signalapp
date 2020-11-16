import { Box, ButtonBase, Grid, Paper, Typography } from "@material-ui/core";
import BorderAllIcon from '@material-ui/icons/BorderAll';
import BorderVerticalIcon from '@material-ui/icons/BorderVertical';
import DirectionsRunIcon from '@material-ui/icons/DirectionsRun';
import MeetingRoomIcon from '@material-ui/icons/MeetingRoom';
import PowerIcon from '@material-ui/icons/Power';
import PowerOffOutlinedIcon from '@material-ui/icons/PowerOffOutlined';
import WbIncandescentIcon from '@material-ui/icons/WbIncandescent';
import WbIncandescentOutlinedIcon from '@material-ui/icons/WbIncandescentOutlined';
import React, { useEffect, useState } from "react";
import { Area, AreaChart } from "recharts";
import HttpService from "../../src/services/HttpService";

export interface IDeviceContact {
    name?: string;
    dataType?: string;
}

export interface IDeviceEndpoint {
    channel?: string;
    inputs?: IDeviceContact[];
    outputs?: IDeviceContact[];
}

export interface IDeviceConfiguration {
    alias?: string;
    identifier?: string;
    endpoints?: IDeviceEndpoint[]
}

export interface IDeviceProps {
    deviceConfiguration?: IDeviceConfiguration,
    inline?: boolean,
    displayConfig: IDeviceWidgetConfig
}

export interface IDeviceContactValue {
    contact: IDeviceContact;
    value?: any
}

export interface IHistoricalValue {
    timeStamp: Date;
    value?: any;
}

export interface IDeviceWidgetConfig {
    icon?: "light" | "socket" | "motion" | "window" | "doors"
    displayName?: string;
    activeContactName?: string;
    actionContactName?: string;
}

function colorTemperatureToRGB(kelvin: number) {
    var temp = kelvin / 100;
    var red, green, blue;
    if (temp <= 66) {
        red = 255;
        green = temp;
        green = 99.4708025861 * Math.log(green) - 161.1195681661;

        if (temp <= 19) {
            blue = 0;
        } else {
            blue = temp - 10;
            blue = 138.5177312231 * Math.log(blue) - 305.0447927307;
        }
    } else {

        red = temp - 60;
        red = 329.698727446 * Math.pow(red, -0.1332047592);

        green = temp - 60;
        green = 288.1221695283 * Math.pow(green, -0.0755148492);

        blue = 255;
    }

    return {
        r: clamp(red, 0, 255),
        g: clamp(green, 0, 255),
        b: clamp(blue, 0, 255)
    }
}

function clamp(x: number, min: number, max: number) {
    if (x < min) { return min; }
    if (x > max) { return max; }
    return x;
}

function defaultDisplay(config?: IDeviceConfiguration) {
    const displayConfig: IDeviceWidgetConfig = {};

    if (config && config.alias) {
        const lightMatch = config.alias.match(/light/i);
        if (lightMatch && lightMatch.length >= 0) {
            displayConfig.icon = "light";
        }

        const motionMatch = config.alias.match(/motion/i);
        if (motionMatch && motionMatch.length >= 0) {
            displayConfig.icon = "motion";
        }
    }

    if (displayConfig.icon === "light") {
        displayConfig.actionContactName = "state";
        displayConfig.activeContactName = "state";
    } else if (displayConfig.icon === "motion") {
        displayConfig.activeContactName = "occupancy"
    }

    return displayConfig;
}

async function getDeviceStateAsync(deviceIdentifier: string, contact: IDeviceContact) {
    return await HttpService.getAsync(`http://192.168.0.20:5000/beacon/device-state?identifier=${deviceIdentifier}&contact=${contact.name}`)
        .then<IDeviceContactValue>(v => {
            return {
                contact: contact,
                value: v
            };
        });
}

const Device = (props: IDeviceProps) => {
    const [historicalData, setHistoricalData] = useState<IHistoricalValue[]>([]);
    const [isActive, setIsActive] = useState<boolean>(false);

    const displayConfig = props.displayConfig || defaultDisplay(props.deviceConfiguration);

    const masterEndpoint = props.deviceConfiguration?.endpoints?.filter(e => e.channel === "main");

    const refreshActiveAsync = async () => {
        if (typeof displayConfig.activeContactName === "undefined")
            return;

        const state = await getDeviceStateAsync(props.deviceConfiguration?.identifier, { name: displayConfig.activeContactName });

        let newState = isActive;
        if (typeof state.value === "boolean") {
            newState = !!state.value;
        }
        else if (typeof state.value === "string") {
            newState = state.value === "ON";
        }

        if (newState === isActive) return;
        console.debug(newState, isActive, typeof newState, typeof isActive);
        setIsActive(newState);

        console.log('Device state change', props.deviceConfiguration?.alias,props.deviceConfiguration?.identifier, state.contact.name, state.contact.dataType, "Value: ", state.value, `(${typeof state.value})`)
    };

    const loadHistoricalDataAsync = async () => {
        if (masterEndpoint?.length) {
            const doubleContacts = masterEndpoint[0].inputs?.filter(ci => ci.dataType === "double" && ci.name !== "battery" && ci.name !== "linkquality");
            if (doubleContacts?.length) {
                setInterval(async () => {
                    try {
                        const contactName = doubleContacts[0].name;
                        const startTimeStamp = new Date(new Date().getTime() - 60 * 60 * 1000);
                        var data = (await HttpService.getAsync(`http://192.168.0.20:5000/beacon/device-state-history?identifier=${props.deviceConfiguration?.identifier}&contact=${contactName}&startTimeStamp=${startTimeStamp.toISOString()}&endTimeStamp=${new Date().toISOString()}`)) as IHistoricalValue[];
                        if (data) {
                            setHistoricalData(data.map(d => { return { timeStamp: d.timeStamp, value: d.value / 10 }; }));
                        }
                    } catch (error) {
                        console.warn("Failed to load historical data for device ", props.deviceConfiguration?.identifier);
                    }
                }, 10000);
            }
        }
    };

    useEffect(() => {
        refreshActiveAsync();
        // loadHistoricalDataAsync();

        const interval = setInterval(refreshActiveAsync, 3000);
        return () => clearInterval(interval);
    }, []);

    const handleOutputContact = () => {
        HttpService.requestAsync("http://192.168.0.20:5000/beacon/conduct", "post", {
            target: {
                identifier: props.deviceConfiguration?.identifier,
                channel: "main",
                contact: displayConfig.actionContactName
            },
            value: isActive ? "OFF" : "ON"
        });
        for (let index = 0; index < 5; index++) {
            setTimeout(() => refreshActiveAsync(), (index + 1) * 200);
        }
    };

    const iconsMap = {
        "light": [WbIncandescentOutlinedIcon, WbIncandescentIcon],
        "socket": [PowerOffOutlinedIcon, PowerIcon],
        "motion": [DirectionsRunIcon, DirectionsRunIcon],
        "window": [BorderVerticalIcon, BorderAllIcon],
        "doors": [BorderVerticalIcon, MeetingRoomIcon],
        "none": []
    }

    const IconComponent = iconsMap[displayConfig.icon || "none"][isActive ? 1 : 0];
    const displayName = displayConfig?.displayName || props.deviceConfiguration?.alias;
    const ActionComponent = typeof displayConfig.actionContactName !== "undefined" ? ButtonBase : React.Fragment;
    const actionComponentProps = typeof displayConfig.actionContactName !== "undefined" ? { onClick: () => handleOutputContact() } : {};

    let backgroundColor = undefined;
    let color = undefined;
    if ((displayConfig.icon === "light" || displayConfig.icon === "motion") && isActive) {
        backgroundColor = "rgba(255, 187, 109, 1)"; // 3000K temp default
        color = "#333";
        // const colorTempK = contactValue({ name: "color_temp", dataType: "double" });
        // if (typeof colorTempK?.value === "number") {
        //     const { r, g, b } = colorTemperatureToRGB(colorTempK.value);
        //     backgroundColor = `rgba(${r}, ${g}, ${b}, 0.7`;
        // }
    }

    const showDiagram = false;

    return (
        <Paper style={{ backgroundColor: backgroundColor, color: color }}>
            <ActionComponent {...actionComponentProps}>
                <Box width={220}>
                    <Grid container direction="row" justifyContent="space-between" alignItems={props.inline ? "center" : "flex-start"}>
                        <Grid item zeroMinWidth>
                            <Box p={2} display="flex" alignItems="center">
                                {IconComponent && (
                                    <Box mr={1} height={35}>
                                        <IconComponent fontSize="large" />
                                    </Box>
                                )}
                                <Typography variant="body2" noWrap>{displayName || "Unknown"}</Typography>
                            </Box>
                        </Grid>
                        {showDiagram && (
                            <Grid item>
                                <AreaChart width={220} height={40} data={historicalData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                    <Area type="basis" dataKey="value" dot={false} fill="#ffffff" fillOpacity={0.1} stroke="#aeaeae" strokeWidth={2} />
                                </AreaChart>
                            </Grid>
                        )}
                    </Grid>
                </Box>
            </ActionComponent>
        </Paper>
    );
};

export default Device;