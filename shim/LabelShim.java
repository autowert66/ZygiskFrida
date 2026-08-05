package re.zyg.fri;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import java.lang.reflect.Method;
import java.util.List;

public class LabelShim {
    public static void main(String[] args) {
        try {
            android.os.Looper.prepareMainLooper();
            Class<?> activityThreadClass = Class.forName("android.app.ActivityThread");
            Method systemMain = activityThreadClass.getMethod("systemMain");
            Object thread = systemMain.invoke(null);
            
            Method getSystemContext = activityThreadClass.getMethod("getSystemContext");
            Context ctx = (Context) getSystemContext.invoke(thread);
            
            PackageManager pm = ctx.getPackageManager();
            List<ApplicationInfo> apps = pm.getInstalledApplications(0);
            
            System.out.println("{");
            boolean first = true;
            for (ApplicationInfo ai : apps) {
                // Ignore system apps (optional, but usually users only want user apps for this)
                if ((ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0) {
                    continue;
                }
                
                if (!first) {
                    System.out.println(",");
                }
                first = false;
                CharSequence label = pm.getApplicationLabel(ai);
                String labelStr = label != null ? label.toString() : ai.packageName;
                
                labelStr = labelStr.replace("\\", "\\\\").replace("\"", "\\\"");
                System.out.print("  \"" + ai.packageName + "\": \"" + labelStr + "\"");
            }
            System.out.println("\n}");
        } catch (Exception e) {
            e.printStackTrace();
            System.exit(1);
        }
    }
}
