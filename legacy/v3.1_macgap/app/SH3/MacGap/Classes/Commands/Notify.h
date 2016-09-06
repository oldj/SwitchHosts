//
//  Notify.h
//  MG
//
//  Created by Tim Debo on 5/27/14.
//
//

#import "Command.h"
@protocol NotifyExports <JSExport>

- (void) notify:(NSDictionary*)aNotification;
- (void) close:(NSString*)notificationId;

@property (readonly) NSMutableArray* notifications;
@end

@interface Notify : Command <NotifyExports, NSUserNotificationCenterDelegate>
+ (BOOL) available;
@end
