import { describe, expect, it } from 'vitest';
import { isGpuFdTarget, parseFdinfo, sumDrmClients } from '../src/fdinfo.js';
import { fixture } from './support.js';

describe('DRM fdinfo on the spike A1 fixtures', () => {
  it('reads driver, client id and VRAM of the llama-server router, its child and ComfyUI', () => {
    const router = parseFdinfo(fixture('fdinfo-llama-server-pid1185602-fd7.txt'))!;
    const child = parseFdinfo(fixture('fdinfo-llama-server-pid1208225-fd10.txt'))!;
    const comfy = parseFdinfo(fixture('fdinfo-python3-pid1185741-fd7.txt'))!;
    expect(child).toEqual({ driver: 'amdgpu', clientId: '1950', vramKiB: 4575848, engineNs: null });
    expect(router.driver).toBe('amdgpu');
    expect(router.clientId).not.toBe(child.clientId);
    expect(router.vramKiB).toBeLessThan(1024);
    expect(comfy.vramKiB).toBeGreaterThan(4 * 1024 * 1024);
    // ROCm processes print no drm-engine-* line on this kernel.
    expect(router.engineNs).toBeNull();
    expect(comfy.engineNs).toBeNull();
  });

  it('a container sums every PID (router plus per-model child)', () => {
    const router = parseFdinfo(fixture('fdinfo-llama-server-pid1185602-fd7.txt'))!;
    const child = parseFdinfo(fixture('fdinfo-llama-server-pid1208225-fd10.txt'))!;
    const total = sumDrmClients([router, child]);
    expect(total.clients).toBe(2);
    expect(total.vramKiB).toBe(router.vramKiB + child.vramKiB);
    expect(total.engineNs).toBeNull();
  });

  it('one DRM client seen through four fds counts once (kwin) and its engine counter is parsed', () => {
    const infos = [28, 29, 30, 31].map((fd) => parseFdinfo(fixture(`fdinfo-kwin_wayland-pid2782-fd${fd}.txt`))!);
    expect(new Set(infos.map((info) => info.clientId)).size).toBe(1);
    const total = sumDrmClients(infos);
    expect(total.clients).toBe(1);
    expect(total.vramKiB).toBe(infos[0]!.vramKiB);
    expect(infos[0]!.engineNs).toBeGreaterThan(0);
    expect(total.engineNs).toBe(infos[0]!.engineNs);
  });

  it('non-DRM fds and units', () => {
    expect(parseFdinfo('pos:\t0\nflags:\t02100002\n')).toBeNull();
    expect(parseFdinfo(null)).toBeNull();
    expect(parseFdinfo('drm-driver:\tamdgpu\ndrm-client-id:\t7\ndrm-memory-vram:\t2 MiB\n')!.vramKiB).toBe(2048);
    expect(parseFdinfo('drm-driver:\txe\ndrm-client-id:\t7\ndrm-total-vram:\t4096\n')!.vramKiB).toBe(4);
    expect(parseFdinfo('drm-driver:\ti915\ndrm-client-id:\t7\ndrm-engine-render:\t500 ns\ndrm-engine-capacity-render:\t2\ndrm-engine-copy:\t250 ns\n')!.engineNs).toBe(750);
    expect(isGpuFdTarget('/dev/dri/renderD128')).toBe('drm');
    expect(isGpuFdTarget('/dev/kfd')).toBe('kfd');
    expect(isGpuFdTarget('/dev/dri/card1')).toBeNull();
    expect(isGpuFdTarget('/dev/null')).toBeNull();
    expect(isGpuFdTarget(null)).toBeNull();
  });
});
