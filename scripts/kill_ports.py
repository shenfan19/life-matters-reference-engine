"""Stops whatever is listening on the ports of the LM backend and GUI, with the processes it started.

    python scripts/kill_ports.py              stop the default ports, 18080 backend and 5173 GUI (5174 when the GUI had to move)
    python scripts/kill_ports.py 18080        stop only the ports given
    python scripts/kill_ports.py --list       show what is listening on them and stop nothing

Only a process that LISTENS on a port is stopped. A program that merely has a connection to the port, such as a
browser tab talking to the backend, is left alone. The process is stopped together with the processes it started,
so `npm` takes its `node` with it.
"""

import os
import re
import subprocess
import sys

DEFAULT_PORTS = [18080, 5173, 5174]
WINDOWS = os.name == 'nt'


def listening_pids(port):
    """The ids of the processes listening on a TCP port."""
    pids = set()
    if WINDOWS:
        out = subprocess.run(['netstat', '-ano', '-p', 'tcp'], capture_output=True, text=True).stdout
        for line in out.splitlines():
            cols = line.split()
            # Proto  Local address  Foreign address  State  PID
            if len(cols) >= 5 and cols[3] == 'LISTENING' and re.search(r':%d$' % port, cols[1]):
                pids.add(int(cols[4]))
    else:
        for cmd in (['lsof', '-t', '-i', 'tcp:%d' % port, '-sTCP:LISTEN'], ['fuser', '%d/tcp' % port]):
            try:
                out = subprocess.run(cmd, capture_output=True, text=True).stdout
            except FileNotFoundError:
                continue
            pids |= {int(x) for x in re.findall(r'\d+', out)}
            if pids:
                break
    pids.discard(0)
    pids.discard(os.getpid())
    return pids


def process_name(pid):
    if WINDOWS:
        out = subprocess.run(['tasklist', '/FI', 'PID eq %d' % pid, '/FO', 'CSV', '/NH'], capture_output=True, text=True).stdout
        m = re.match(r'"([^"]+)"', out.strip())
        return m.group(1) if m else '?'
    out = subprocess.run(['ps', '-o', 'comm=', '-p', str(pid)], capture_output=True, text=True).stdout.strip()
    return out or '?'


def stop(pid):
    if WINDOWS:
        # /T also ends the processes it started, /F does not wait for it to agree
        subprocess.run(['taskkill', '/T', '/F', '/PID', str(pid)], capture_output=True)
    else:
        subprocess.run(['pkill', '-TERM', '-P', str(pid)], capture_output=True)
        subprocess.run(['kill', '-TERM', str(pid)], capture_output=True)


def main(argv):
    list_only = '--list' in argv
    ports = [int(a) for a in argv if a.isdigit()] or DEFAULT_PORTS
    found = 0
    for port in ports:
        for pid in sorted(listening_pids(port)):
            found += 1
            name = process_name(pid)
            if list_only:
                print('port %d: %s (pid %d)' % (port, name, pid))
            else:
                print('port %d: stopping %s (pid %d)' % (port, name, pid))
                stop(pid)
    if not found:
        print('Nothing is listening on %s.' % ', '.join(str(p) for p in ports))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
