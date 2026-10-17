import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import java.io.*;
public class DumpMatch extends GhidraScript {
  public void run() throws Exception {
    String out = getScriptArgs()[0]; String pat = getScriptArgs()[1];
    DecompInterface d = new DecompInterface();
    d.openProgram(currentProgram);
    PrintWriter pw = new PrintWriter(new FileWriter(out));
    for (Function f : currentProgram.getFunctionManager().getFunctions(true)) {
      if (!f.getName(true).matches(pat)) continue;
      DecompileResults r = d.decompileFunction(f, 120, monitor);
      pw.println("// ==== " + f.getName(true) + " @ " + f.getEntryPoint());
      if (r != null && r.decompileCompleted()) pw.println(r.getDecompiledFunction().getC());
    }
    pw.close();
  }
}
