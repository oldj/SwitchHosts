//
//  File.h
//  MG
//
//  Created by Tim Debo on 6/8/14.
//
//

#import "Command.h"
@protocol FileExports <JSExport>

JSExportAs(write, - (void) writeFile:(NSString*)filePath withData: (JSValue*) data andType: (NSString*) type );
JSExportAs(read, - (JSValue*) readFile:(NSString*)filePath ofType: (NSString*) type);
- (BOOL) exists:(NSString*)filePath;

@end

@interface File : Command <FileExports>

@end
