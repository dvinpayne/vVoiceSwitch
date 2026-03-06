import Modal from 'antd/es/modal'
import Select from 'antd/es/select'
import Input from 'antd/es/input'
import Button from 'antd/es/button'
import Switch from 'antd/es/switch'
import { useCoreStore, type Facility } from '../model';
import { useMemo, useState, useCallback } from 'react';
import { loadVacsCredentials, clearVacsCredentials } from '../lib/vacs/store';
import { VVSCS_SERVER_URL } from '../lib/vvscs/types';

interface Position {
    cs: string;
    pos: string;
    freq: number;
    rn: string;
    lines: any[];
}

/** Recursively collect all positions from a facility and its children */
function collectPositions(facility: Facility): Position[] {
    const positions: Position[] = [...(facility.positions || [])];
    for (const child of facility.childFacilities || []) {
        positions.push(...collectPositions(child));
    }
    return positions;
}

const formatFreq = (freq: number) => {
    if (!freq) return '';
    const val = freq / 1_000_000;
    if (val % 1 === 0) return val.toFixed(1);
    return val.toString().replace(/0+$/, '').replace(/\.$/, '');
};

interface SettingModalProps {
    open: boolean;
    setModal: (open: boolean) => void;
}

function SettingModal({ open, setModal }: SettingModalProps) {
    const positionsData = useCoreStore(s => s.positionData)
    const updateSelectedPosition = useCoreStore(s => s.updateSelectedPositions)
    const vacsConnected = useCoreStore(s => s.vacsConnected)
    const vacsStatus = useCoreStore(s => s.vacsStatus)
    const vacsError = useCoreStore(s => s.vacsError)
    const connectVacs = useCoreStore(s => s.connectVacs)
    const disconnectVacs = useCoreStore(s => s.disconnectVacs)
    const vvscsConnected = useCoreStore(s => s.vvscsConnected)
    const vvscsStatus = useCoreStore(s => s.vvscsStatus)
    const vvscsError = useCoreStore(s => s.vvscsError)
    const connectVvscs = useCoreStore(s => s.connectVvscs)
    const disconnectVvscs = useCoreStore(s => s.disconnectVvscs)
    const callsign = useCoreStore(s => s.callsign)
    const [selectedFacility, setSelectedFacility] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)
    const [vacsToken, setVacsToken] = useState('')
    const [useProdVacs, setUseProdVacs] = useState(() => {
        const saved = loadVacsCredentials();
        return saved?.useProd ?? false;
    })
    const [hasSavedToken, setHasSavedToken] = useState(() => !!loadVacsCredentials())
    const [vvscsFacility, setVvscsFacility] = useState('')
    const [vvscsPosition, setVvscsPosition] = useState('')

    // Build facility options from top-level childFacilities
    const facilities = useMemo(() => {
        if (!positionsData || !positionsData.childFacilities) return [];
        return positionsData.childFacilities.map(f => ({
            value: f.id,
            label: f.name || f.id,
        }));
    }, [positionsData]);

    // Get positions for the selected facility, filtered by search
    const filteredPositions = useMemo(() => {
        if (!positionsData || !selectedFacility) return [];
        const facility = positionsData.childFacilities?.find(f => f.id === selectedFacility);
        if (!facility) return [];
        const all = collectPositions(facility);
        if (!search.trim()) return all;
        const q = search.toLowerCase();
        return all.filter(p =>
            p.pos?.toLowerCase().includes(q) ||
            p.cs?.toLowerCase().includes(q) ||
            p.rn?.toLowerCase().includes(q)
        );
    }, [positionsData, selectedFacility, search]);

    const onSubmit = () => {
        if (!selectedPosition) return;
        updateSelectedPosition([selectedPosition]);
        setModal(false);
        // Reset state for next open
        setSelectedFacility(null);
        setSearch('');
        setSelectedPosition(null);
    };

    const onCancel = () => {
        setModal(false);
        setSelectedFacility(null);
        setSearch('');
        setSelectedPosition(null);
    };

    /** Connect with a WS token */
    const handleVacsConnect = useCallback(() => {
        if (!vacsToken.trim()) return;
        const positionId = callsign || undefined;
        connectVacs(vacsToken.trim(), positionId, useProdVacs);
        setVacsToken('');
        setTimeout(() => setHasSavedToken(!!loadVacsCredentials()), 3000);
    }, [vacsToken, callsign, connectVacs, useProdVacs]);

    /** Clear saved VACS token from localStorage */
    const handleClearSavedToken = useCallback(() => {
        clearVacsCredentials();
        setHasSavedToken(false);
    }, []);

    /** Open VACS in browser to get a token */
    const handleOpenVacs = useCallback(() => {
        const base = useProdVacs ? 'https://vacs.network' : 'https://dev.vacs.network';
        window.open(base, '_blank');
    }, [useProdVacs]);

    const handleVvscsConnect = useCallback(() => {
        if (!vvscsFacility.trim() || !vvscsPosition.trim()) return;
        connectVvscs(vvscsFacility.trim().toUpperCase(), vvscsPosition.trim());
        // Don't clear inputs so user can see what they connected as
    }, [vvscsFacility, vvscsPosition, connectVvscs]);

    return (
        <Modal
            title="Select Position"
            open={open}
            onCancel={onCancel}
            onOk={onSubmit}
            okButtonProps={{ disabled: !selectedPosition }}
            okText="Connect"
        >
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <Select
                    placeholder="Facility"
                    value={selectedFacility}
                    onChange={(val) => {
                        setSelectedFacility(val);
                        setSelectedPosition(null);
                    }}
                    options={facilities}
                    style={{ width: 160 }}
                    showSearch
                    filterOption={(input, option) =>
                        (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                />
                <Input
                    placeholder="Search positions..."
                    value={search}
                    onChange={e => {
                        setSearch(e.target.value);
                        setSelectedPosition(null);
                    }}
                    allowClear
                    disabled={!selectedFacility}
                    style={{ flex: 1 }}
                />
            </div>

            <div style={{
                maxHeight: 320,
                overflowY: 'auto',
                border: '1px solid #d9d9d9',
                borderRadius: 6,
            }}>
                {!selectedFacility ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
                        Select a facility to view positions
                    </div>
                ) : filteredPositions.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#999' }}>
                        No positions found
                    </div>
                ) : (
                    filteredPositions.map((pos) => {
                        const isSelected = selectedPosition?.cs === pos.cs;
                        return (
                            <div
                                key={pos.cs}
                                onClick={() => setSelectedPosition(pos)}
                                style={{
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    background: isSelected ? '#1677ff' : 'transparent',
                                    color: isSelected ? '#fff' : 'inherit',
                                    borderBottom: '1px solid #f0f0f0',
                                }}
                            >
                                <div style={{ fontWeight: 500 }}>{pos.pos}</div>
                                <div style={{ fontSize: 12, opacity: 0.7 }}>
                                    {pos.cs}{pos.freq ? ` — ${formatFreq(pos.freq)}` : ''}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* VACS WebRTC Connection */}
            <div style={{ marginTop: 16, borderTop: '1px solid #d9d9d9', paddingTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 500 }}>VACS (WebRTC)</span>
                    <span style={{
                        fontSize: 12,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: vacsConnected ? '#52c41a' : '#d9d9d9',
                        color: vacsConnected ? '#fff' : '#666',
                    }}>
                        {vacsStatus}
                    </span>
                </div>
                {vacsError && (
                    <div style={{ fontSize: 12, color: '#ff4d4f', marginBottom: 8 }}>
                        {vacsError}
                    </div>
                )}
                {vacsConnected ? (
                    <Button size="small" danger onClick={disconnectVacs}>
                        Disconnect
                    </Button>
                ) : (
                    <>
                        {hasSavedToken && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <span style={{ fontSize: 12, color: '#52c41a' }}>
                                    Token saved — will auto-connect when position has vacs: lines
                                </span>
                                <Button size="small" onClick={handleClearSavedToken} style={{ marginLeft: 'auto' }}>
                                    Forget
                                </Button>
                            </div>
                        )}
                        <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>
                            Get your WS token from the{' '}
                            <a onClick={handleOpenVacs} style={{ color: '#1677ff', cursor: 'pointer' }}>
                                VACS website
                            </a>
                            {' '}→ login → open browser console → look for the token in the WebSocket connection.
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: 12, color: '#999' }}>Dev</span>
                                <Switch
                                    size="small"
                                    checked={useProdVacs}
                                    onChange={setUseProdVacs}
                                />
                                <span style={{ fontSize: 12, color: '#999' }}>Prod</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Input
                                size="small"
                                placeholder="Paste VACS WS token"
                                value={vacsToken}
                                onChange={e => setVacsToken(e.target.value)}
                                onPressEnter={handleVacsConnect}
                                style={{ flex: 1 }}
                            />
                            <Button
                                size="small"
                                type="primary"
                                disabled={!vacsToken.trim()}
                                onClick={handleVacsConnect}
                            >
                                Connect
                            </Button>
                        </div>
                    </>
                )}
            </div>

            {/* v-VSCS WebRTC Connection */}
            <div style={{ marginTop: 16, borderTop: '1px solid #d9d9d9', paddingTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 500 }}>v-VSCS (WebRTC)</span>
                    <span style={{
                        fontSize: 12,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: vvscsConnected ? '#52c41a' : '#d9d9d9',
                        color: vvscsConnected ? '#fff' : '#666',
                    }}>
                        {vvscsStatus}
                    </span>
                </div>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>
                    Server: {VVSCS_SERVER_URL}
                </div>
                {vvscsError && (
                    <div style={{ fontSize: 12, color: '#ff4d4f', marginBottom: 8 }}>
                        {vvscsError}
                    </div>
                )}
                {vvscsConnected ? (
                    <Button size="small" danger onClick={disconnectVvscs}>
                        Disconnect
                    </Button>
                ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Input
                            size="small"
                            placeholder="Facility (e.g. ZOA)"
                            value={vvscsFacility}
                            onChange={e => setVvscsFacility(e.target.value)}
                            style={{ width: 110 }}
                        />
                        <Input
                            size="small"
                            placeholder="Position (e.g. R62)"
                            value={vvscsPosition}
                            onChange={e => setVvscsPosition(e.target.value)}
                            onPressEnter={handleVvscsConnect}
                            style={{ flex: 1 }}
                        />
                        <Button
                            size="small"
                            type="primary"
                            disabled={!vvscsFacility.trim() || !vvscsPosition.trim()}
                            onClick={handleVvscsConnect}
                        >
                            Connect
                        </Button>
                    </div>
                )}
            </div>
        </Modal>
    );
}

export default SettingModal;
