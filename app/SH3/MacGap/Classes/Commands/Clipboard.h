//
//  Clipboard.h
//  MG
//
//  Created by Tim Debo on 5/28/14.
//
//

#import "Command.h"
@protocol ClipboardExports <JSExport>
JSExportAs(copy, - (void) copy:(NSString*)text);
- (NSString *) paste;
@end

@interface Clipboard : Command <ClipboardExports>

@end
