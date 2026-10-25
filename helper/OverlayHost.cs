using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public sealed class Viewport { public double width, height, dpr; }
public sealed class BoardRect { public double left, top, width, height; }
public sealed class Frame {
    public string type, from, to, color, move, detail, evaluation, status;
    public bool visible, flipped, darkMode;
    public Viewport viewport;
    public BoardRect board;
}

static class Native {
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
    public delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowDisplayAffinity(IntPtr window, uint value);
    [DllImport("user32.dll")] public static extern bool GetWindowDisplayAffinity(IntPtr window, out uint value);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr window, EnumWindowsProc callback, IntPtr parameter);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr window, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr window);

    public static bool BrowserViewport(Frame frame, out Rectangle bounds, out float scale) {
        bounds = Rectangle.Empty; scale = 1;
        IntPtr browser = GetForegroundWindow(); uint process;
        GetWindowThreadProcessId(browser,out process);
        string name;
        try { name = Process.GetProcessById((int)process).ProcessName.ToLowerInvariant(); } catch { return false; }
        if (name != "chrome" && name != "brave" && name != "msedge" && name != "chromium") return false;
        int width = (int)Math.Round(frame.viewport.width * frame.viewport.dpr);
        int height = (int)Math.Round(frame.viewport.height * frame.viewport.dpr);
        Rectangle found = Rectangle.Empty;
        EnumChildWindows(browser,delegate(IntPtr child, IntPtr unused) {
            if (!IsWindowVisible(child)) return true;
            var className = new StringBuilder(256); GetClassName(child,className,256);
            if (className.ToString() != "Chrome_RenderWidgetHostHWND") return true;
            Rect childRect; GetWindowRect(child,out childRect);
            if (Math.Abs(childRect.Right-childRect.Left-width) <= 8 && Math.Abs(childRect.Bottom-childRect.Top-height) <= 8)
                found = Rectangle.FromLTRB(childRect.Left,childRect.Top,childRect.Right,childRect.Bottom);
            return true;
        },IntPtr.Zero);
        if (found.IsEmpty) {
            Rect client; if (!GetClientRect(browser,out client)) return false;
            if (Math.Abs(client.Right-client.Left-width) > 32 || height > client.Bottom-client.Top) return false;
            var origin = new Point(); ClientToScreen(browser,ref origin);
            found = new Rectangle(origin.X,origin.Y+client.Bottom-height,width,height);
        }
        bounds = found;
        scale = Math.Max(1,GetDpiForWindow(browser)/96f);
        return true;
    }
}

static class PaintOverlay {
    static GraphicsPath Rounded(RectangleF rect, float radius) {
        float d=radius*2;
        var path = new GraphicsPath();
        path.AddArc(rect.Left,rect.Top,d,d,180,90); path.AddArc(rect.Right-d,rect.Top,d,d,270,90);
        path.AddArc(rect.Right-d,rect.Bottom-d,d,d,0,90); path.AddArc(rect.Left,rect.Bottom-d,d,d,90,90);
        path.CloseFigure(); return path;
    }
    static PointF Square(string square, bool flipped) {
        float file=square[0]-'a', rank=square[1]-'1';
        return flipped ? new PointF(7.5f-file,rank+.5f) : new PointF(file+.5f,7.5f-rank);
    }
    static bool ValidSquare(string value) {
        return value != null && value.Length == 2 && value[0] >= 'a' && value[0] <= 'h' && value[1] >= '1' && value[1] <= '8';
    }
    public static void Draw(Graphics graphics, Frame frame, Size size, float uiScale) {
        // Opaque edge pixels prevent colour-key fringes on the transparent window.
        graphics.SmoothingMode = SmoothingMode.None;
        graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        if (frame.board != null && ValidSquare(frame.from) && ValidSquare(frame.to) && frame.from != frame.to) {
            PointF from=Square(frame.from,frame.flipped), to=Square(frame.to,frame.flipped);
            float dx=to.X-from.X, dy=to.Y-from.Y, tip=(float)Math.Sqrt(dx*dx+dy*dy)-.1f, shoulder=tip-.4f;
            var saved = graphics.Save();
            graphics.TranslateTransform((float)(frame.board.left*frame.viewport.dpr),(float)(frame.board.top*frame.viewport.dpr));
            graphics.ScaleTransform((float)(frame.board.width*frame.viewport.dpr/8),(float)(frame.board.height*frame.viewport.dpr/8));
            graphics.TranslateTransform(from.X,from.Y);
            graphics.RotateTransform((float)(Math.Atan2(dy,dx)*180/Math.PI));
            using (var path = new GraphicsPath()) {
                path.AddLines(new [] {new PointF(.34f,-.09f),new PointF(shoulder,-.09f),new PointF(shoulder,-.3f),new PointF(tip,0),new PointF(shoulder,.3f),new PointF(shoulder,.09f),new PointF(.34f,.09f)});
                path.AddBezier(.34f,.09f,.22f,.09f,.22f,-.09f,.34f,-.09f); path.CloseFigure();
                Color color;
                try { color=ColorTranslator.FromHtml(frame.color ?? "#ffbe55"); } catch {color=Color.Orange;}
                using (var pen=new Pen(Color.FromArgb(23,33,25),.035f)) {pen.LineJoin=LineJoin.Round;graphics.DrawPath(pen,path);}
                using (var brush=new SolidBrush(color)) graphics.FillPath(brush,path);
            }
            graphics.Restore(saved);
        }
        float s=uiScale, width=250*s, height=142*s;
        var card=new RectangleF(Math.Max(8,size.Width-width-18*s),Math.Max(8,size.Height-height-18*s),width,height);
        Color bg=ColorTranslator.FromHtml(frame.darkMode ? "#171b22" : "#ffffff");
        Color fg=ColorTranslator.FromHtml(frame.darkMode ? "#e4ebf5" : "#26364a");
        Color muted=ColorTranslator.FromHtml(frame.darkMode ? "#91a0b5" : "#8190a2");
        using (var shape=Rounded(card,8*s)) {
            using (var brush=new SolidBrush(bg)) graphics.FillPath(brush,shape);
            using (var pen=new Pen(frame.darkMode ? Color.FromArgb(52,65,85) : Color.FromArgb(227,232,239),s)) graphics.DrawPath(pen,shape);
        }
        using (var titleFont=new Font("Segoe UI",12*s,FontStyle.Bold,GraphicsUnit.Pixel))
        using (var moveFont=new Font("Segoe UI",30*s,FontStyle.Bold,GraphicsUnit.Pixel))
        using (var font=new Font("Segoe UI",12*s,FontStyle.Regular,GraphicsUnit.Pixel))
        using (var text=new SolidBrush(fg))
        using (var secondary=new SolidBrush(muted)) {
            float x=card.Left+15*s, y=card.Top+12*s;
            graphics.DrawString("Gambaguette",titleFont,secondary,x,y);
            graphics.DrawString(frame.move ?? "—",moveFont,text,x,y+20*s);
            using (var format = new StringFormat {Alignment=StringAlignment.Far})
                graphics.DrawString(frame.evaluation ?? "",font,secondary,new RectangleF(x,y+33*s,width-30*s,20*s),format);
            graphics.DrawString(frame.detail ?? "",font,secondary,x,y+65*s);
            graphics.DrawString(frame.status ?? "",font,secondary,x,y+88*s);
        }
    }
}

sealed class OverlayWindow : Form {
    Frame frame;
    DateTime updated;
    readonly bool test;
    public bool Protected;
    public int ProtectionError;
    public OverlayWindow(bool testMode) {
        test=testMode; Text="Gambaguette Private Overlay"; FormBorderStyle=FormBorderStyle.None;
        ShowInTaskbar=testMode; TopMost=true; StartPosition=FormStartPosition.Manual;
        AutoScaleMode=AutoScaleMode.None; BackColor=Color.Magenta; TransparencyKey=Color.Magenta;
        Bounds=new Rectangle(0,0,1,1); DoubleBuffered=true;
        var timer=new System.Windows.Forms.Timer {Interval=50};
        timer.Tick += delegate {PositionOverlay();}; timer.Start();
    }
    protected override bool ShowWithoutActivation {get {return true;}}
    protected override CreateParams CreateParams {get {
        var parameters=base.CreateParams;
        parameters.ExStyle |= 0x80000 | 0x20 | 0x8000000;
        if (!test) parameters.ExStyle |= 0x80;
        return parameters;
    }}
    protected override void OnHandleCreated(EventArgs e) {
        base.OnHandleCreated(e);
        uint affinity;
        Protected=Environment.OSVersion.Version.Build >= 19041 && Native.SetWindowDisplayAffinity(Handle,0x11)
            && Native.GetWindowDisplayAffinity(Handle,out affinity) && affinity == 0x11;
        ProtectionError=Protected ? 0 : Marshal.GetLastWin32Error();
    }
    public void UpdateFrame(Frame value) {
        if (test && (value.type == "test-protect" || value.type == "test-unprotect")) {
            Native.SetWindowDisplayAffinity(Handle,value.type == "test-protect" ? 0x11u : 0u);
            uint affinity;Protected=Native.GetWindowDisplayAffinity(Handle,out affinity) && affinity == 0x11;
            Invalidate();return;
        }
        if (value.type == "hide") {frame=null;Hide();return;}
        if (value.type != "frame" || value.viewport == null || value.board == null) return;
        if (value.viewport.width < 100 || value.viewport.width > 16000 || value.viewport.height < 100 || value.viewport.height > 16000 || value.viewport.dpr < .5 || value.viewport.dpr > 8) return;
        frame=value; updated=DateTime.UtcNow; PositionOverlay();if (Visible) Invalidate();
    }
    void PositionOverlay() {
        if ((!Protected && !test) || frame == null || !frame.visible || DateTime.UtcNow.Subtract(updated).TotalMilliseconds > 900) {Hide();return;}
        Rectangle rectangle; float scale;
        if (test) {rectangle=new Rectangle(80,80,(int)frame.viewport.width,(int)frame.viewport.height);scale=1;}
        else if (!Native.BrowserViewport(frame,out rectangle,out scale)) {Hide();return;}
        if (Bounds != rectangle) Bounds=rectangle;
        if (uiScale != scale) {uiScale=scale;Invalidate();}
        if (!Visible) Show();
    }
    float uiScale=1;
    protected override void OnPaint(PaintEventArgs e) {
        base.OnPaint(e);
        if ((Protected || test) && frame != null && frame.visible) PaintOverlay.Draw(e.Graphics,frame,ClientSize,uiScale);
    }
}

static class Program {
    static readonly JavaScriptSerializer Json=new JavaScriptSerializer();
    static readonly Stream Output=Console.OpenStandardOutput();
    static readonly object OutputLock=new object();
    static void Send(object value) {
        byte[] bytes=Encoding.UTF8.GetBytes(Json.Serialize(value));
        lock (OutputLock) {byte[] length=BitConverter.GetBytes(bytes.Length);Output.Write(length,0,4);Output.Write(bytes,0,bytes.Length);Output.Flush();}
    }
    [STAThread] static void Main(string[] arguments) {
        try {
            Native.SetProcessDpiAwarenessContext(new IntPtr(-4));
            if (arguments.Length == 2 && arguments[0] == "--preview") {
                using (var bitmap=new Bitmap(680,480)) using (var graphics=Graphics.FromImage(bitmap)) {
                    graphics.Clear(Color.FromArgb(36,42,51));
                    PaintOverlay.Draw(graphics,new Frame {type="frame",visible=true,darkMode=true,color="#65b9ff",from="e2",to="e4",move="e4",detail="White · e2 → e4",evaluation="White: +0.25",status="Depth 16",viewport=new Viewport {width=680,height=480,dpr=1},board=new BoardRect {left=24,top=24,width=400,height=400}},bitmap.Size,1);
                    bitmap.Save(arguments[1],System.Drawing.Imaging.ImageFormat.Png);
                }
                return;
            }
            Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
            bool test=Array.IndexOf(arguments,"--test-mode") >= 0;
            var window=new OverlayWindow(test);
            var handle=window.Handle;
            Send(new {type="hello",ready=window.Protected,captureProtected=window.Protected,error=window.ProtectionError,process=Process.GetCurrentProcess().Id});
            var input=new Thread(delegate() {
                try {
                    using (var reader=new BinaryReader(Console.OpenStandardInput())) {
                        while (true) {
                            int size=reader.ReadInt32(); if (size <= 0 || size > 65536) break;
                            byte[] bytes=reader.ReadBytes(size); if (bytes.Length != size) break;
                            Frame frame=Json.Deserialize<Frame>(Encoding.UTF8.GetString(bytes));
                            window.BeginInvoke((Action)delegate {
                                window.UpdateFrame(frame);
                                if (test) {uint affinity;Native.GetWindowDisplayAffinity(window.Handle,out affinity);Send(new {type="state",visible=window.Visible,affinity=affinity,width=window.Width,height=window.Height});}
                            });
                        }
                    }
                } catch (EndOfStreamException) {} catch (IOException) {} catch (InvalidOperationException) {}
                finally {try {window.BeginInvoke((Action)delegate {Application.Exit();});} catch (InvalidOperationException) {}}
            });
            input.IsBackground=true; input.Start(); Application.Run(window);
        } catch (Exception error) {try {Send(new {type="error",error=error.Message});} catch {}}
    }
}
