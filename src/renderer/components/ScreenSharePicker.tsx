/*
 * SPDX-License-Identifier: GPL-3.0
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 */

import "./screenSharePicker.css";

import { closeModal, Logger, Margins, Modals, ModalSize, openModal, useAwaiter } from "@vencord/types/utils";
import { findStoreLazy, onceReady } from "@vencord/types/webpack";
import {
    Button,
    Card,
    FluxDispatcher,
    Forms,
    Select,
    Switch,
    Text,
    UserStore,
    useState
} from "@vencord/types/webpack/common";
import type { Dispatch, SetStateAction } from "react";
import { addPatch } from "renderer/patches/shared";
import { isLinux, isWindows } from "renderer/utils";

const StreamResolutions = ["480", "720", "1080"] as const;
const StreamFps = ["24", "30", "60"] as const;

const MediaEngineStore = findStoreLazy("MediaEngineStore");

export type StreamResolution = (typeof StreamResolutions)[number];
export type StreamFps = (typeof StreamFps)[number];

interface StreamSettings {
    resolution: StreamResolution;
    fps: StreamFps;
    audio: boolean;
    contentHint?: string;
    workaround?: boolean;
    onlyDefaultSpeakers?: boolean;
}

export interface StreamPick extends StreamSettings {
    id: string;
}

interface Source {
    id: string;
    name: string;
    url: string;
}

export let currentSettings: StreamSettings | null = null;

const logger = new Logger("VesktopScreenShare");

addPatch({
    patches: [
        {
            find: "this.localWant=",
            replacement: {
                match: /this.localWant=/,
                replace: "$self.patchStreamQuality(this);$&"
            }
        }
    ],
    patchStreamQuality(opts: any) {
        if (!currentSettings) return;

        const framerate = Number(currentSettings.fps);
        const height = Number(currentSettings.resolution);
        const width = Math.round(height * (16 / 9));

        Object.assign(opts, {
            bitrateMin: 1000000,
            bitrateMax: 25000000,
            bitrateTarget: 15000000
        });
        if (opts?.encode) {
            Object.assign(opts.encode, {
                framerate,
                width,
                height,
                pixelCount: height * width
            });
        }
        Object.assign(opts.capture, {
            framerate,
            width,
            height,
            pixelCount: height * width
        });
    }
});

if (isLinux) {
    onceReady.then(() => {
        FluxDispatcher.subscribe("STREAM_CLOSE", ({ streamKey }: { streamKey: string }) => {
            const owner = streamKey.split(":").at(-1);

            if (owner !== UserStore.getCurrentUser().id) {
                return;
            }

            VesktopNative.virtmic.stop();
        });
    });
}

export function openScreenSharePicker(screens: Source[], skipPicker: boolean) {
    let didSubmit = false;
    return new Promise<StreamPick>((resolve, reject) => {
        const key = openModal(
            props => (
                <ModalComponent
                    screens={screens}
                    modalProps={props}
                    submit={async v => {
                        didSubmit = true;
                        if (v.audio) await VesktopNative.virtmic.start(["stub :3"], v.workaround);
                        resolve(v);
                    }}
                    close={() => {
                        props.onClose();
                        if (!didSubmit) reject("Aborted");
                    }}
                    skipPicker={skipPicker}
                />
            ),
            {
                onCloseRequest() {
                    closeModal(key);
                    reject("Aborted");
                }
            }
        );
    });
}

function ScreenPicker({ screens, chooseScreen }: { screens: Source[]; chooseScreen: (id: string) => void }) {
    return (
        <div className="vcd-screen-picker-grid">
            {screens.map(({ id, name, url }) => (
                <label key={id}>
                    <input type="radio" name="screen" value={id} onChange={() => chooseScreen(id)} />

                    <img src={url} alt="" />
                    <Text variant="text-sm/normal">{name}</Text>
                </label>
            ))}
        </div>
    );
}

function StreamSettings({
    source,
    settings,
    setSettings,
    skipPicker
}: {
    source: Source;
    settings: StreamSettings;
    setSettings: Dispatch<SetStateAction<StreamSettings>>;
    skipPicker: boolean;
}) {
    const [thumb] = useAwaiter(
        () => (skipPicker ? Promise.resolve(source.url) : VesktopNative.capturer.getLargeThumbnail(source.id)),
        {
            fallbackValue: source.url,
            deps: [source.id]
        }
    );

    return (
        <div className={""}>
            <div>
                <Forms.FormTitle>What you're streaming</Forms.FormTitle>
                <Card className="vcd-screen-picker-card vcd-screen-picker-preview">
                    <img
                        src={thumb}
                        alt=""
                        className={"vcd-screen-picker-preview-img"}
                    />
                    <Text variant="text-sm/normal">{source.name}</Text>
                </Card>

                <Forms.FormTitle>Stream Settings</Forms.FormTitle>

                <Card className="vcd-screen-picker-card">
                    <div className="vcd-screen-picker-quality">
                        <section>
                            <Forms.FormTitle>Resolution</Forms.FormTitle>
                            <div className="vcd-screen-picker-radios">
                                {StreamResolutions.map(res => (
                                    <label
                                        className="vcd-screen-picker-radio"
                                        data-checked={settings.resolution === res}
                                    >
                                        <Text variant="text-sm/bold">{res}</Text>
                                        <input
                                            type="radio"
                                            name="resolution"
                                            value={res}
                                            checked={settings.resolution === res}
                                            onChange={() => setSettings(s => ({ ...s, resolution: res }))}
                                        />
                                    </label>
                                ))}
                            </div>
                        </section>

                        <section>
                            <Forms.FormTitle>Frame Rate</Forms.FormTitle>
                            <div className="vcd-screen-picker-radios">
                                {StreamFps.map(fps => (
                                    <label className="vcd-screen-picker-radio" data-checked={settings.fps === fps}>
                                        <Text variant="text-sm/bold">{fps}</Text>
                                        <input
                                            type="radio"
                                            name="fps"
                                            value={fps}
                                            checked={settings.fps === fps}
                                            onChange={() => setSettings(s => ({ ...s, fps }))}
                                        />
                                    </label>
                                ))}
                            </div>
                        </section>
                    </div>
                    {source.name === "OBS" && (
                        <div className="vcd-screen-picker-quality">
                            <section>
                                <div>
                                    <div className="vcd-screen-picker-radios">

                                    </div>
                                    <div className="vcd-screen-picker-hint-description">
                                        <p></p>
                                    </div>
                                </div>
                                <Switch
                                    value={settings.audio}
                                    onChange={checked => setSettings(s => ({ ...s, audio: checked }))}
                                    hideBorder
                                    className="vcd-screen-picker-audio"
                                >
                                    Stream With Audio
                                </Switch>
                            </section>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}

function ModalComponent({
    screens,
    modalProps,
    submit,
    close,
    skipPicker
}: {
    screens: Source[];
    modalProps: any;
    submit: (data: StreamPick) => void;
    close: () => void;
    skipPicker: boolean;
}) {

    let obs = screens.find(s => s.name != null && s.name.startsWith("OBS"));
    const [selected, setSelected] = useState<string | undefined>(obs ? obs.id : void 0);
    const [settings, setSettings] = useState<StreamSettings>({
        resolution: "1080",
        fps: "60",
        contentHint: "motion",
        audio: true
    });

    return (
        <Modals.ModalRoot {...modalProps} className="screensharemenu" size={ModalSize.MEDIUM}>
            <Modals.ModalHeader className="vcd-screen-picker-header">
                <Forms.FormTitle tag="h2">ScreenShare</Forms.FormTitle>
                <Modals.ModalCloseButton onClick={close} />
            </Modals.ModalHeader>
            <Modals.ModalContent className="vcd-screen-picker-modal">
                {!selected ? (
                    <ScreenPicker screens={screens} chooseScreen={setSelected} />
                ) : (
                    <StreamSettings
                        source={screens.find(s => s.id === selected)!}
                        settings={settings}
                        setSettings={setSettings}
                        skipPicker={skipPicker}
                    />
                )}
            </Modals.ModalContent>
            <Modals.ModalFooter className="vcd-screen-picker-footer">
                <Button
                    disabled={!selected}
                    onClick={() => {
                        currentSettings = settings;
                        try {
                            const frameRate = Number(settings.fps);
                            const height = Number(settings.resolution);
                            const width = Math.round(height * (16 / 9));

                            const conn = [...MediaEngineStore.getMediaEngine().connections].find(
                                connection => connection.streamUserId === UserStore.getCurrentUser().id
                            );

                            if (conn) {
                                conn.videoStreamParameters[0].maxFrameRate = frameRate;
                                conn.videoStreamParameters[0].maxResolution.height = height;
                                conn.videoStreamParameters[0].maxResolution.width = width;
                            }

                            submit({
                                id: selected!,
                                ...settings
                            });

                            setTimeout(async () => {
                                const conn = [...MediaEngineStore.getMediaEngine().connections].find(
                                    connection => connection.streamUserId === UserStore.getCurrentUser().id
                                );
                                if (!conn) return;

                                const track = conn.input.stream.getVideoTracks()[0];

                                const constraints = {
                                    ...track.getConstraints(),
                                    frameRate,
                                    width: { min: width, ideal: width, max: width },
                                    height: { min: height, ideal: height, max: height },
                                    advanced: [{ width: width, height: height }],
                                    resizeMode: "none"
                                };

                                try {
                                    await track.applyConstraints(constraints);

                                    logger.info(
                                        "Applied constraints successfully. New constraints:",
                                        track.getConstraints()
                                    );
                                } catch (e) {
                                    logger.error("Failed to apply constraints.", e);
                                }
                            }, 100);
                        } catch (error) {
                            logger.error("Error while submitting stream.", error);
                        }

                        close();
                    }}
                >
                    Go Live
                </Button>

                {selected && !skipPicker ? (
                    <Button color={Button.Colors.TRANSPARENT} onClick={() => setSelected(void 0)}>
                        Back
                    </Button>
                ) : (
                    <Button color={Button.Colors.TRANSPARENT} onClick={close}>
                        Cancel
                    </Button>
                )}
            </Modals.ModalFooter>
        </Modals.ModalRoot>
    );
}
