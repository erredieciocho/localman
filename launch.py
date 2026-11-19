import argparse
import functools
import http.server
import pathlib
import webbrowser


PROJECT_ROOT = pathlib.Path(__file__).resolve().parent


def create_server(port: int) -> http.server.ThreadingHTTPServer:
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler,
        directory=str(PROJECT_ROOT),
    )
    return http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)


def main() -> None:
    parser = argparse.ArgumentParser(description="Launch the TCOAAL localisation editor.")
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Local port to use (default: 8000; use 0 to select an available port).",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Start the local server without opening a browser.",
    )
    args = parser.parse_args()

    with create_server(args.port) as server:
        address = f"http://127.0.0.1:{server.server_port}/"
        print(f"TCOAAL Localisation Editor: {address}", flush=True)
        if not args.no_browser:
            webbrowser.open(address)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopping the local server.", flush=True)


if __name__ == "__main__":
    main()
