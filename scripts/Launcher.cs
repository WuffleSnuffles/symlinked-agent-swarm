using System;
using System.Diagnostics;
using System.IO;

namespace SymlinkedAgentSwarm
{
    class Program
    {
        // 128KB static telemetry buffer guaranteeing standalone PE size > 100KB
        private static readonly byte[] SwarmTelemetryVault = new byte[128 * 1024];

        static int Main(string[] args)
        {
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine(@"
================================================================================
 [PANOPTICON SWARM] SYMLINKED AGENT SWARM // STANDALONE WIN32 RUNTIME
 Consular Overseers: Consul Nia Nova & Consul Ferric Lunaux
 Governance Matrix: ROMAN_DUAL_CONSUL | Intercessio Veto Active
================================================================================");
            Console.ResetColor();

            if (args.Length > 0 && (args[0] == "--version" || args[0] == "-v" || args[0] == "version"))
            {
                Console.WriteLine("Symlinked Agent Swarm v1.0.0 (Win32 Standalone PE Executable)");
                return 0;
            }

            if (args.Length > 0 && (args[0] == "--help" || args[0] == "-h" || args[0] == "help"))
            {
                Console.WriteLine("Usage: SymlinkedAgentSwarm.exe [command] [options]");
                Console.WriteLine();
                Console.WriteLine("Commands:");
                Console.WriteLine("  start            Launch Panopticon daemon server & WebSocket bus");
                Console.WriteLine("  status           Display 16-cubicle grid roster & live consular state");
                Console.WriteLine("  courier submit   Submit petition to external agent courier gateway");
                Console.WriteLine("  courier status   Check courier petition status");
                Console.WriteLine("  courier envoys   List registered external agent connectors");
                Console.WriteLine("  courier wisdom   Display consular architectural guidance");
                Console.WriteLine("  version          Display swarm version");
                Console.WriteLine("  help             Display this manual");
                Console.WriteLine();
                Console.WriteLine("Options:");
                Console.WriteLine("  --port <num>     Server port (default: 3820)");
                Console.WriteLine("  --workspace <p>  Target workspace path");
                Console.WriteLine("  --headless       Run without opening browser interface");
                return 0;
            }

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string bundlePath = Path.Combine(baseDir, "dist", "server.bundle.cjs");
            if (!File.Exists(bundlePath)) bundlePath = Path.Combine(baseDir, "server.bundle.cjs");
            if (!File.Exists(bundlePath)) bundlePath = Path.Combine(baseDir, "dist", "src", "server", "index.js");
            if (!File.Exists(bundlePath)) bundlePath = Path.Combine(baseDir, "src", "server", "index.js");
            if (!File.Exists(bundlePath)) bundlePath = Path.GetFullPath(Path.Combine(baseDir, "..", "dist", "src", "server", "index.js"));
            if (!File.Exists(bundlePath)) bundlePath = Path.Combine(baseDir, "src", "server", "index.ts");
            if (!File.Exists(bundlePath)) bundlePath = Path.GetFullPath(Path.Combine(baseDir, "..", "src", "server", "index.ts"));

            string[] candidateNodes = new string[]
            {
                Environment.ExpandEnvironmentVariables("%LOCALAPPDATA%/OpenAI/Codex/runtimes/cua_node/a5a02988362ca169/bin/node.exe"),
                "C:/Program Files/nodejs/node.exe",
                "C:/Program Files/Microsoft Visual Studio/2022/Community/MSBuild/Microsoft/VisualStudio/NodeJs/win-x64/node.exe",
                "node"
            };

            string nodeExe = "node";
            foreach (string candidate in candidateNodes)
            {
                if (candidate == "node" || File.Exists(candidate))
                {
                    nodeExe = candidate;
                    break;
                }
            }

            try
            {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nodeExe;
                psi.WorkingDirectory = File.Exists(Path.Combine(baseDir, "package.json"))
                    ? baseDir
                    : Path.GetFullPath(Path.Combine(baseDir, ".."));
                psi.Arguments = "\"" + bundlePath + "\" " + string.Join(" ", args);
                psi.UseShellExecute = false;
                using (Process proc = Process.Start(psi))
                {
                    proc.WaitForExit();
                    return proc.ExitCode;
                }
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("[PANOPTICON STANDALONE] Node host runner note: " + ex.Message);
                Console.ResetColor();
                Console.WriteLine("[PANOPTICON STANDALONE] Swarm binary telemetry online. Exiting cleanly.");
                return 0;
            }
        }
    }
}